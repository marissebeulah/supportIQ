import { useEffect, useRef, useState } from "react";
import type { DependencyList } from "react";
import { errorMessage } from "./api";
import type { RealtimeEvent } from "./types";

type ApiState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

/**
 * Runs an async loader whenever deps or the manual reload counter change.
 * Keeps the previous payload visible while a background refresh is in flight.
 */
export function useApi<T>(
  loader: () => Promise<T>,
  deps: DependencyList = [],
  options: { enabled?: boolean } = {},
): ApiState<T> & {
  reload: () => void;
  setData: (updater: T | ((current: T | null) => T | null)) => void;
} {
  const enabled = options.enabled !== false;
  const [state, setState] = useState<ApiState<T>>({ data: null, error: null, loading: enabled });
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let active = true;
    setState((current) => ({ ...current, loading: current.data === null, error: null }));
    loaderRef
      .current()
      .then((data) => {
        if (active) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (active) {
          setState((current) => ({ data: current.data, error: errorMessage(error), loading: false }));
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled]);

  const setData = (updater: T | ((current: T | null) => T | null)) => {
    setState((current) => ({
      ...current,
      data:
        typeof updater === "function"
          ? (updater as (value: T | null) => T)(current.data)
          : updater,
    }));
  };

  return { ...state, reload: () => setNonce((value) => value + 1), setData };
}

/**
 * Eases a number from its last displayed value to the target value.
 * Counters animate from zero on first render and respect reduced motion.
 */
export function useCountUp(value: number, duration = 760): number {
  const [display, setDisplay] = useState(0);
  const shownRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const target = Number.isFinite(value) ? value : 0;
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = shownRef.current;

    if (reduce || from === target) {
      shownRef.current = target;
      setDisplay(target);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (target - from) * eased;
      shownRef.current = current;
      setDisplay(current);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        shownRef.current = target;
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [value, duration]);

  return display;
}

export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export type RealtimeStatus = "connecting" | "live" | "offline";
type RealtimeSubscriber = (event: RealtimeEvent) => void;

/**
 * One EventSource is shared by every useRealtime() consumer in the tab.
 * Browsers cap HTTP/1.1 connections per host, and opening a stream per
 * component used to starve the connection that delivers incoming calls.
 */
const realtimeSubscribers = new Set<RealtimeSubscriber>();
const realtimeStatusListeners = new Set<(status: RealtimeStatus) => void>();
let realtimeSource: EventSource | null = null;
let realtimeStatus: RealtimeStatus = "connecting";

function emitRealtimeStatus(next: RealtimeStatus): void {
  if (realtimeStatus === next) return;
  realtimeStatus = next;
  for (const listener of realtimeStatusListeners) listener(next);
}

function ensureRealtimeSource(): void {
  if (realtimeSource) return;
  let source: EventSource;
  try {
    source = new EventSource("/api/events");
  } catch {
    emitRealtimeStatus("offline");
    return;
  }
  realtimeSource = source;
  emitRealtimeStatus("connecting");
  source.onopen = () => emitRealtimeStatus("live");
  source.onerror = () => emitRealtimeStatus("offline");
  source.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data) as RealtimeEvent;
      if (!parsed || typeof parsed.type !== "string") return;
      for (const subscriber of [...realtimeSubscribers]) {
        try {
          subscriber(parsed);
        } catch {
          // One broken handler must not stop the rest.
        }
      }
    } catch {
      // Ignore malformed frames.
    }
  };
}

function releaseRealtimeSourceIfIdle(): void {
  if (realtimeSubscribers.size > 0 || !realtimeSource) return;
  realtimeSource.close();
  realtimeSource = null;
  realtimeStatus = "connecting";
}

/** Subscribes to the shared SupportIQ server-sent event stream. */
export function useRealtime(
  handler: (event: RealtimeEvent) => void,
  enabled = true,
): RealtimeStatus {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const [status, setStatus] = useState<RealtimeStatus>(realtimeStatus);

  useEffect(() => {
    if (!enabled) {
      setStatus(realtimeStatus);
      return;
    }
    const subscriber: RealtimeSubscriber = (event) => handlerRef.current(event);
    realtimeSubscribers.add(subscriber);
    ensureRealtimeSource();
    setStatus(realtimeStatus);

    const statusListener = (next: RealtimeStatus) => setStatus(next);
    realtimeStatusListeners.add(statusListener);
    return () => {
      realtimeSubscribers.delete(subscriber);
      realtimeStatusListeners.delete(statusListener);
      releaseRealtimeSourceIfIdle();
    };
  }, [enabled]);

  return status;
}

export function useTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · SupportIQ`;
  }, [title]);
}
