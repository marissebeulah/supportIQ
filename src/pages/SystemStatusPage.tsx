import { useEffect, useRef, useState } from "react";
import {
  Activity,
  CircleAlert,
  CircleCheck,
  Clock,
  Copy,
  Database,
  Monitor,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { formatSpan, relativeTime } from "../lib/format";
import { useApi, useRealtime } from "../lib/hooks";
import type { DiagnosticsDevice, DiagnosticsSummary } from "../lib/types";
import { Button, Card, CardHead, PageHead, Spinner } from "../components/ui";
import { useToast } from "../components/toast";

type Tone = "ok" | "warn" | "off";

/** A paired PC counts as reachable while it keeps polling (every ~20 s). */
function deviceState(device: DiagnosticsDevice): { label: string; tone: Tone } {
  if (!device.lastSeenAt) return { label: "Never connected", tone: "off" };
  const seconds = (Date.now() - new Date(device.lastSeenAt).getTime()) / 1000;
  if (seconds <= 90) return { label: "Connected now", tone: "ok" };
  if (seconds <= 600) return { label: "Recently online", tone: "warn" };
  return { label: "Offline", tone: "off" };
}

export default function SystemStatusPage() {
  const { toast } = useToast();
  const summary = useApi<DiagnosticsSummary>(() => api.get<DiagnosticsSummary>("/api/diagnostics"), []);
  const streamStatus = useRealtime(() => {}, true);

  const [latency, setLatency] = useState<{ ms: number | null; error: string | null }>({
    ms: null,
    error: null,
  });
  const [probing, setProbing] = useState(false);
  const [probeNonce, setProbeNonce] = useState(0);

  /* Browser → API: three round trips, report the fastest so a slow first
     request (cold connection) doesn't make the check look broken. */
  useEffect(() => {
    let active = true;
    async function probe() {
      setProbing(true);
      const samples: number[] = [];
      try {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const started = performance.now();
          await api.get<{ ok: boolean }>("/api/health");
          samples.push(performance.now() - started);
        }
        if (active) setLatency({ ms: Math.round(Math.min(...samples)), error: null });
      } catch (error) {
        if (active) setLatency({ ms: null, error: errorMessage(error) });
      } finally {
        if (active) setProbing(false);
      }
    }
    void probe();
    return () => {
      active = false;
    };
  }, [probeNonce]);

  const reloadRef = useRef(summary.reload);
  reloadRef.current = summary.reload;

  useEffect(() => {
    const timer = window.setInterval(() => reloadRef.current(), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast("Copied.");
    } catch {
      toast(value, "info");
    }
  }

  function checkAgain() {
    setProbeNonce((value) => value + 1);
    summary.reload();
  }

  const data = summary.data;
  const devices = data?.devices ?? [];
  const reachable = devices.filter((device) => deviceState(device).tone === "ok");
  const latestCheckIn = devices.find((device) => device.lastSeenAt)?.lastSeenAt ?? null;
  const apiOk = latency.ms !== null;
  const databaseOk = data ? data.persistence.ok : summary.loading ? null : false;
  const streamOk = streamStatus === "live";

  const banner = !apiOk
    ? {
        tone: "warn" as Tone,
        title: "This browser can't reach the SupportIQ API",
        detail:
          latency.error ??
          "Check that the SupportIQ server is running, then use the address IT support gave you.",
      }
    : databaseOk === false
      ? {
          tone: "warn" as Tone,
          title: "The database isn't answering",
          detail: data?.persistence.error ?? "Restart the SupportIQ server and check the log.",
        }
      : devices.length > 0 && reachable.length === 0
        ? {
            tone: "warn" as Tone,
            title: "No paired PC has checked in recently",
            detail:
              "The agent on that PC may be closed, or it may be pointing at an old address. Open the SupportIQ Agent there and check the address below.",
          }
        : {
            tone: "ok" as Tone,
            title: "Everything the check can see is reachable",
            detail:
              devices.length > 0
                ? `${reachable.length} of ${devices.length} paired ${devices.length === 1 ? "PC is" : "PCs are"} checking in now.`
                : "This browser, the API and the database are answering. Pair a PC to test the agent too.",
          };
  const BannerIcon = banner.tone === "ok" ? CircleCheck : CircleAlert;

  return (
    <>
      <PageHead
        eyebrow="Diagnostics"
        title="Connection check"
        description="Tests the browser, the SupportIQ API, the database and the Windows agent on each paired PC."
        actions={
          <Button variant="secondary" onClick={checkAgain} loading={probing}>
            <RefreshCw size={15} /> Check again
          </Button>
        }
      />

      <div className={`status-banner is-${banner.tone}`} role="status">
        <BannerIcon size={18} />
        <div>
          <strong>{banner.title}</strong>
          <p>{banner.detail}</p>
        </div>
      </div>

      <div className="status-grid">
        <Card>
          <CardHead title="This browser → SupportIQ" description="Round trip to /api/health" />
          <div className="card-body status-card-body">
            <span className={`status-pill-text is-${apiOk ? "ok" : "off"}`}>
              {apiOk ? <Wifi size={14} /> : <WifiOff size={14} />}
              {apiOk ? "Reachable" : "Not reachable"}
            </span>
            <p className="status-metric">{apiOk ? `${latency.ms} ms` : "—"}</p>
            <p className="status-detail">
              {apiOk
                ? `Served from ${window.location.host} · fastest of 3 checks`
                : (latency.error ?? "No answer from the API.")}
            </p>
          </div>
        </Card>

        <Card>
          <CardHead title="Live updates" description="Event stream the page listens to" />
          <div className="card-body status-card-body">
            <span className={`status-pill-text is-${streamOk ? "ok" : streamStatus === "offline" ? "off" : "warn"}`}>
              <Activity size={14} />
              {streamStatus === "live" ? "Live" : streamStatus === "connecting" ? "Connecting" : "Offline"}
            </span>
            <p className="status-metric">{streamStatus === "live" ? "On" : "—"}</p>
            <p className="status-detail">
              {streamStatus === "live"
                ? `${data?.server.realtimeClients ?? 0} open ${data?.server.realtimeClients === 1 ? "stream" : "streams"} on the server.`
                : "Ticket and remote-session updates appear late until this reconnects."}
            </p>
          </div>
        </Card>

        <Card>
          <CardHead title="Database" description="Server-side persistence check" />
          <div className="card-body status-card-body">
            <span className={`status-pill-text is-${databaseOk ? "ok" : databaseOk === false ? "off" : "warn"}`}>
              <Database size={14} />
              {databaseOk ? "Healthy" : databaseOk === false ? "Unhealthy" : "Checking"}
            </span>
            <p className="status-metric">
              {databaseOk ? `${data?.persistence.tickets ?? 0} requests` : "—"}
            </p>
            <p className="status-detail">
              {data
                ? `${data.persistence.devices} paired ${data.persistence.devices === 1 ? "PC" : "PCs"} on record.`
                : "Waiting for the server."}
            </p>
          </div>
        </Card>

        <Card>
          <CardHead title="Windows agent → SupportIQ" description="Last check-in from each PC" />
          <div className="card-body status-card-body">
            <span
              className={`status-pill-text is-${devices.length === 0 ? "warn" : reachable.length > 0 ? "ok" : "off"}`}
            >
              <Monitor size={14} />
              {devices.length === 0 ? "No paired PC" : `${reachable.length} of ${devices.length} online`}
            </span>
            <p className="status-metric">{devices.length === 0 ? "—" : relativeTime(latestCheckIn)}</p>
            <p className="status-detail">
              {devices.length === 0
                ? "Pair a PC from a support request to test the agent path."
                : "An agent polls every 20 seconds; older than 90 seconds counts as offline."}
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHead
          title="Address a paired PC should use"
          description="Enter this in the SupportIQ Agent window with Change address when the PC can't connect."
        />
        <div className="card-body">
          {summary.loading && !data ? (
            <Spinner label="Loading addresses…" />
          ) : data ? (
            <div className="status-addresses">
              <div className="status-address">
                <span className="status-address-caption">Server address</span>
                <code>{data.agent.serverUrl}</code>
                <Button size="sm" variant="ghost" onClick={() => void copy(data.agent.serverUrl)}>
                  <Copy size={12} /> Copy
                </Button>
              </div>
              {data.agent.fallbackServerUrl ? (
                <div className="status-address">
                  <span className="status-address-caption">Fallback (machine name)</span>
                  <code>{data.agent.fallbackServerUrl}</code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void copy(data.agent.fallbackServerUrl ?? "")}
                  >
                    <Copy size={12} /> Copy
                  </Button>
                </div>
              ) : null}
              <p className="status-detail">
                Server {data.server.hostname}:{data.server.port} · up {formatSpan(data.server.uptimeSeconds * 1000)} ·
                agent build {data.agent.version}
                {data.agent.downloadAvailable ? "" : " (installer not built)"}
              </p>
            </div>
          ) : (
            <p className="status-detail">{summary.error ?? "The diagnostics endpoint didn't answer."}</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHead
          title="Paired PCs"
          description={
            data?.server.role === "customer"
              ? "The computers paired to your account."
              : "Every paired computer your team can reach."
          }
        />
        {summary.loading && !data ? (
          <Spinner label="Loading paired PCs…" />
        ) : devices.length === 0 ? (
          <div className="card-body">
            <p className="status-detail">
              No computer is paired yet. Open a support request and use the agent setup steps to pair
              this PC.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Computer</th>
                  {data?.server.role === "customer" ? null : <th>Customer</th>}
                  <th>Agent</th>
                  <th>Last check-in</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => {
                  const state = deviceState(device);
                  return (
                    <tr key={device.id}>
                      <td>
                        <div className="status-device">
                          <Monitor size={14} />
                          <span>{device.name}</span>
                          {device.unattendedEnabled ? <span className="status-tag">Connect anytime</span> : null}
                        </div>
                      </td>
                      {data?.server.role === "customer" ? null : (
                        <td>
                          <span>{device.owner?.name ?? "Unknown"}</span>
                          <span className="muted status-owner">{device.owner?.email ?? ""}</span>
                        </td>
                      )}
                      <td>{device.agentVersion ? `v${device.agentVersion}` : "unknown"}</td>
                      <td>
                        <span>{relativeTime(device.lastSeenAt)}</span>
                      </td>
                      <td>
                        <span className={`status-pill-text is-${state.tone}`}>
                          {state.tone === "ok" ? <CircleCheck size={13} /> : <Clock size={13} />}
                          {state.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
