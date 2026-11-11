/**
 * In-memory relay between the browser and the native SupportIQ Agent.
 *
 * Screen frames and input commands are deliberately transient: they live only
 * in this process while a session is active and are dropped when it ends.
 */

const MAX_FRAME_BYTES = 3 * 1024 * 1024;
const MAX_QUEUED_EVENTS = 500;

const frames = new Map();
const queues = new Map();
const waiters = new Map();

export function setFrame(sessionId, buffer, meta = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_FRAME_BYTES) {
    return false;
  }
  frames.set(sessionId, {
    buffer,
    width: Number(meta.width) || 0,
    height: Number(meta.height) || 0,
    sequence: Number(meta.sequence) || 0,
    at: new Date().toISOString(),
  });
  return true;
}

export function getFrame(sessionId) {
  return frames.get(sessionId) ?? null;
}

export function getFrameMeta(sessionId) {
  const frame = frames.get(sessionId);
  if (!frame) return null;
  return { width: frame.width, height: frame.height, updatedAt: frame.at };
}

export function queueInput(sessionId, events) {
  if (!Array.isArray(events) || events.length === 0) return 0;
  const queue = queues.get(sessionId) ?? [];
  for (const event of events) queue.push(event);
  if (queue.length > MAX_QUEUED_EVENTS) {
    queue.splice(0, queue.length - MAX_QUEUED_EVENTS);
  }
  queues.set(sessionId, queue);
  return queue.length;
}

export function takeInput(sessionId) {
  const queue = queues.get(sessionId);
  if (!queue || queue.length === 0) return [];
  queues.delete(sessionId);
  return queue;
}

export function clearSession(sessionId) {
  frames.delete(sessionId);
  queues.delete(sessionId);
}

/** Resolves every long-poll held for this user (a new invite or input arrived). */
export function notifyUser(userId) {
  const entries = waiters.get(userId);
  if (!entries) return;
  waiters.delete(userId);
  for (const finish of entries) finish();
}

/** Waits until notifyUser(userId) runs or the timeout elapses. */
export function waitForUser(userId, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      const entries = waiters.get(userId);
      if (entries) {
        entries.delete(finish);
        if (entries.size === 0) waiters.delete(userId);
      }
      resolve();
    };

    const entries = waiters.get(userId) ?? new Set();
    entries.add(finish);
    waiters.set(userId, entries);
    timer = setTimeout(finish, Math.max(0, timeoutMs));
    if (timer.unref) timer.unref();
  });
}

export function hubStats() {
  return { frames: frames.size, queues: queues.size, waiters: waiters.size };
}
