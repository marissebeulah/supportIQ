import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  Check,
  CircleDot,
  Copy,
  Download,
  Keyboard,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  Minimize2,
  Monitor,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Unplug,
  X,
} from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useApi, useRealtime } from "../lib/hooks";
import { formatSpan, relativeTime } from "../lib/format";
import type { AgentServerInfo, RemoteAgentDevice, RemoteSession, TicketDetail } from "../lib/types";
import { Button, Card, ErrorNote } from "./ui";
import { useToast } from "./toast";

const OPEN_STATUSES = ["requested", "ready", "active"];
const LIVE_VIEWER_INTERVAL_MS = 110;
const INPUT_FLUSH_MS = 35;
const OPEN_STATUS_POLL_MS = 5000;
const IDLE_STATUS_POLL_MS = 15000;

type PairingCode = {
  code: string;
  expiresAt: string;
  serverUrl: string;
  downloadAvailable: boolean;
};

type InputEvent =
  | { t: "m"; x: number; y: number }
  | { t: "md" | "mu"; b: number }
  | { t: "w"; d: number }
  | { t: "kd" | "ku"; k: string; c?: string };

function isOpen(session: RemoteSession | null): boolean {
  return Boolean(session && OPEN_STATUSES.includes(session.status));
}

function expiryLabel(session: RemoteSession): string {
  const remaining = new Date(session.expiresAt).getTime() - Date.now();
  return remaining > 0 ? `expires in ${formatSpan(remaining)}` : "has expired";
}

function closedOutcome(session: RemoteSession): string {
  switch (session.status) {
    case "declined":
      return "declined";
    case "expired":
      return "expired";
    default:
      return "ended";
  }
}

/**
 * Ticket-scoped remote support driven by the SupportIQ Windows agent. IT asks
 * for access, the customer approves in a visible agent window, and screen
 * frames plus mouse/keyboard events flow through this app. Nothing is stored.
 */
export function RemoteSupportPanel({ ticket }: { ticket: TicketDetail }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isCustomer = user?.role === "customer";
  const isStaff = user?.role === "it" || user?.role === "admin";

  const history = useApi<{ remoteSessions: RemoteSession[] }>(
    () => api.get<{ remoteSessions: RemoteSession[] }>(`/api/remote-sessions/ticket/${ticket.id}`),
    [ticket.id],
  );
  const devices = useApi<{ devices: RemoteAgentDevice[] }>(
    () => api.get<{ devices: RemoteAgentDevice[] }>("/api/agent/devices"),
    [ticket.id],
    { enabled: isCustomer },
  );
  const download = useApi<{ available: boolean; version: string; size: number }>(
    () => api.get<{ available: boolean; version: string; size: number }>("/api/agent/download/info"),
    [],
    { enabled: isCustomer },
  );
  const ticketDevices = useApi<{ devices: RemoteAgentDevice[] }>(
    () =>
      api.get<{ devices: RemoteAgentDevice[] }>(
        `/api/remote-sessions/ticket/${ticket.id}/devices`,
      ),
    [ticket.id],
    { enabled: isStaff },
  );

  const realtimeStatus = useRealtime((event) => {
    if (!event.type.startsWith("remote:")) return;
    history.reload();
    if (event.type === "remote:requested" && isCustomer) {
      const requester = event.remoteSession?.requestedBy.name ?? "IT support";
      toast(`${requester} wants remote access to this computer. Approve it in the SupportIQ Agent.`, "info");
    }
    if (event.type === "remote:active" && isCustomer) {
      toast("Remote session is live. Everything stops when you click Stop.", "info");
    }
  }, Boolean(user));

  const sessions = history.data?.remoteSessions ?? [];
  const open = sessions.find((session) => OPEN_STATUSES.includes(session.status)) ?? null;
  const lastClosed = sessions.find((session) => !OPEN_STATUSES.includes(session.status)) ?? null;
  const pairedDevices = devices.data?.devices ?? [];
  const customerDevices = ticketDevices.data?.devices ?? [];

  /* Events can be missed (API restart, network blip), so also poll the session
     record. Without this, a missed "remote:active" event leaves the technician
     stuck on "Waiting for the customer to allow access" for a live session. */
  const reloadHistoryRef = useRef(history.reload);
  reloadHistoryRef.current = history.reload;
  const openKey = open ? `${open.id}:${open.status}` : "idle";
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    const delay = open ? OPEN_STATUS_POLL_MS : IDLE_STATUS_POLL_MS;
    const timer = window.setInterval(() => reloadHistoryRef.current(), delay);
    return () => window.clearInterval(timer);
  }, [openKey]);

  useEffect(() => {
    if (realtimeStatus === "offline") {
      wasOfflineRef.current = true;
      return;
    }
    if (realtimeStatus === "live" && wasOfflineRef.current) {
      wasOfflineRef.current = false;
      reloadHistoryRef.current();
    }
  }, [realtimeStatus]);

  const [requesting, setRequesting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [generating, setGenerating] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  async function requestRemote() {
    setRequesting(true);
    try {
      const response = await api.post<{ remoteSession: RemoteSession; reused?: boolean }>(
        "/api/remote-sessions",
        { ticketId: ticket.id },
      );
      toast(
        response.reused
          ? "A remote session is already open for this request."
          : `Remote request sent to ${ticket.customer.name}. Their agent will ask for approval.`,
        "info",
      );
      history.reload();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setRequesting(false);
    }
  }

  async function declineSession(session: RemoteSession) {
    setDeclining(true);
    try {
      await api.post(`/api/remote-sessions/${session.id}/decline`);
      toast("Remote session declined.", "info");
      history.reload();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setDeclining(false);
    }
  }

  async function endSession(session: RemoteSession) {
    setEnding(true);
    try {
      await api.post(`/api/remote-sessions/${session.id}/end`);
      toast("Remote session ended.", "info");
      history.reload();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setEnding(false);
    }
  }

  async function generateCode() {
    setGenerating(true);
    try {
      const data = await api.post<PairingCode>("/api/agent/pairing-codes");
      setPairing(data);
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setGenerating(false);
    }
  }

  async function downloadInstaller() {
    setInstalling(true);
    try {
      let current = pairing;
      if (!current) {
        const data = await api.post<PairingCode>("/api/agent/pairing-codes");
        setPairing(data);
        current = data;
      }
      const link = document.createElement("a");
      link.href = `/api/agent/installer?code=${encodeURIComponent(current.code)}`;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast("Installer downloaded. Run it on the customer's PC to install and pair the agent.", "info");
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setInstalling(false);
    }
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast("Copied.");
    } catch {
      toast(value, "info");
    }
  }

  async function revokeDevice(device: RemoteAgentDevice) {
    setRevokingId(device.id);
    try {
      await api.del(`/api/agent/devices/${device.id}`);
      toast(`${device.name} is no longer paired.`);
      devices.reload();
      history.reload();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setRevokingId(null);
    }
  }

  if (history.error) return <ErrorNote message={history.error} />;
  if (!isStaff && !isCustomer) return null;

  /* ------------------------------------------------------------- IT support */
  if (isStaff) {
    if (!open) {
      return (
        <Card className="remote-card">
          <div className="remote-panel">
            <span className="remote-panel-icon">
              <Monitor size={18} />
            </span>
            <div className="remote-panel-copy">
              <strong>Remote desktop support</strong>
              <p>
                Ask to view and control {ticket.customer.name}'s computer from this browser.
                They approve the request inside the SupportIQ Agent.
              </p>
              {lastClosed ? (
                <p className="remote-last">
                  Last session {closedOutcome(lastClosed)} ·{" "}
                  {relativeTime(lastClosed.endedAt ?? lastClosed.createdAt)}
                </p>
              ) : null}
            </div>
            <Button size="sm" variant="soft" onClick={() => void requestRemote()} loading={requesting}>
              <Monitor size={14} /> Request session
            </Button>
          </div>
          <UnattendedConnect
            ticketId={ticket.id}
            customerName={ticket.customer.name}
            devices={customerDevices}
            loading={ticketDevices.loading}
            onConnected={history.reload}
            onChanged={ticketDevices.reload}
          />
          <ServerAddressHint onCopy={copyText} />
          <p className="remote-note">
            <Activity size={13} />
            <Link className="link-button" to="/agent/status">
              Connection check
            </Link>
            <span>tests this browser, the server and the customer's agent.</span>
          </p>
        </Card>
      );
    }

    if (open.status === "requested" || open.status === "ready") {
      return (
        <Card className="remote-card">
          <div className="remote-panel">
            <span className="remote-panel-icon is-pending">
              <LoaderCircle size={18} className="spin" />
            </span>
            <div className="remote-panel-copy">
              <strong>Waiting for {open.customer.name} to allow access</strong>
              <p>
                The request {expiryLabel(open)}.{" "}
                {open.customerPaired
                  ? "Approve the prompt in the SupportIQ Agent on their PC."
                  : "They need to install and pair the SupportIQ Agent from this page first."}
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => void endSession(open)} loading={ending}>
              <X size={14} /> Cancel request
            </Button>
          </div>
          <UnattendedConnect
            ticketId={ticket.id}
            customerName={ticket.customer.name}
            devices={customerDevices}
            loading={ticketDevices.loading}
            compact
            onConnected={history.reload}
            onChanged={ticketDevices.reload}
          />
          <p className="remote-note">
            <ShieldCheck size={13} />
            Nothing is shared until the customer clicks Allow in the agent, or you use the
            connect-anytime password saved for their PC.
          </p>
        </Card>
      );
    }

    const canControl = user?.role === "admin" || open.requestedBy.id === user?.id;

    return (
      <Card className="remote-card remote-card-live">
        <RemoteViewer
          session={open}
          canControl={canControl}
          onEnd={() => void endSession(open)}
          ending={ending}
        />
      </Card>
    );
  }

  /* --------------------------------------------------------------- Customer */
  if (isCustomer && open?.status === "active") {
    return (
      <Card className="remote-card remote-card-live">
        <div className="remote-panel">
          <span className="remote-panel-icon is-live">
            <CircleDot size={18} />
          </span>
          <div className="remote-panel-copy">
            <strong>{open.requestedBy.name} is controlling this computer</strong>
            <p>
              They can see this screen and use your mouse and keyboard. Connected{" "}
              {relativeTime(open.startedAt ?? open.approvedAt)}.
            </p>
            <p className="remote-last">
              Every action happens live. Nothing is recorded or saved by SupportIQ.
            </p>
            {open.startedWith === "password" ? (
              <p className="remote-last">
                This session started with the unattended access password saved for this PC.
              </p>
            ) : null}
          </div>
          <Button size="sm" variant="danger" onClick={() => void endSession(open)} loading={ending}>
            <Unplug size={14} /> Stop sharing
          </Button>
        </div>
        <p className="remote-note">
          <TriangleAlert size={13} />
          Stop here or use the red bar on your screen. Both disconnect immediately.
        </p>
      </Card>
    );
  }

  if (isCustomer && (open?.status === "requested" || open?.status === "ready")) {
    return (
      <Card className="remote-card remote-card-request">
        <div className="remote-head">
          <span className="remote-panel-icon is-pending">
            <Monitor size={18} />
          </span>
          <div className="remote-panel-copy">
            <p className="remote-eyebrow">Remote support request</p>
            <strong className="remote-title">
              {open.requestedBy.name} wants to control this computer
            </strong>
            <p>
              They can see your screen and use your mouse and keyboard until you stop. Approval
              happens in the SupportIQ Agent, not on this page.
            </p>
          </div>
        </div>

        {open.customerPaired ? (
          <div className="agent-prompt-note">
            <span className="agent-prompt-pulse" />
            <div>
              <strong>Check your PC for the approval prompt</strong>
              <p>
                The SupportIQ Agent is running. Click <b>Allow</b> in its window to start. If you
                don't see it, open the agent from the system tray.
              </p>
            </div>
          </div>
        ) : (
          <AgentSetup
            pairing={pairing}
            generating={generating}
            onGenerate={() => void generateCode()}
            onInstall={() => void downloadInstaller()}
            installing={installing}
            onCopy={copyText}
            downloadAvailable={download.data?.available ?? false}
            devices={pairedDevices}
            onRevoke={(device) => void revokeDevice(device)}
            revokingId={revokingId}
          />
        )}

        <div className="remote-actions">
          <Button variant="secondary" onClick={() => void declineSession(open)} loading={declining}>
            <X size={15} /> Don't allow
          </Button>
        </div>

        <p className="remote-note">
          <ShieldCheck size={13} />
          Only approve if you asked SupportIQ for help and you recognize {open.requestedBy.name}.
        </p>
      </Card>
    );
  }

  // Customer idle state: let them set up the PC before the next request.
  return (
    <Card className="remote-card">
      <div className="remote-panel">
        <span className="remote-panel-icon">
          <Monitor size={18} />
        </span>
        <div className="remote-panel-copy">
          <strong>Remote desktop support</strong>
          <p>
            Pair this Windows PC once. IT support can then request access when you ask for help,
            and you approve each session in the agent.
          </p>
          {lastClosed ? (
            <p className="remote-last">
              Last session {closedOutcome(lastClosed)} ·{" "}
              {relativeTime(lastClosed.endedAt ?? lastClosed.createdAt)}
            </p>
          ) : null}
        </div>
        {pairedDevices.length === 0 ? (
          <Button size="sm" variant="soft" onClick={() => void generateCode()} loading={generating}>
            <Monitor size={14} /> Set up this PC
          </Button>
        ) : (
          <span className="agent-ready-pill">
            <Check size={12} /> {pairedDevices.length === 1 ? "PC paired" : `${pairedDevices.length} PCs paired`}
          </span>
        )}
      </div>

      {pairedDevices.length === 0 && pairing ? (
        <AgentSetup
          pairing={pairing}
          generating={generating}
          onGenerate={() => void generateCode()}
          onInstall={() => void downloadInstaller()}
          installing={installing}
          onCopy={copyText}
          downloadAvailable={download.data?.available ?? false}
          devices={pairedDevices}
          onRevoke={(device) => void revokeDevice(device)}
          revokingId={revokingId}
        />
      ) : null}

      {pairedDevices.length > 0 ? (
        <div className="agent-devices">
          {pairedDevices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              forgetting={revokingId === device.id}
              onForget={() => void revokeDevice(device)}
              onChanged={devices.reload}
            />
          ))}
          <button className="link-button" onClick={() => void generateCode()} disabled={generating}>
            <RefreshCw size={12} /> Pair another PC
          </button>
        </div>
      ) : null}

      {pairedDevices.length === 0 && !pairing ? (
        <p className="remote-note">
          <LockKeyhole size={13} />
          Download the agent, enter the pairing code, and leave it running in the tray.
        </p>
      ) : null}

      {pairing ? null : <ServerAddressHint onCopy={copyText} />}
      <p className="remote-note">
        <Activity size={13} />
        <Link className="link-button" to="/portal/status">
          Connection check
        </Link>
        <span>tests this browser, the server and this PC's agent.</span>
      </p>
    </Card>
  );
}

/* ----------------------------------------------------------- Server address */

/** The address to type into a PC that has to be paired or repaired by hand. */
function ServerAddressHint({ onCopy }: { onCopy: (value: string) => void }) {
  const info = useApi<AgentServerInfo>(() => api.get<AgentServerInfo>("/api/agent/server-info"), []);
  if (!info.data) return null;
  return (
    <div className="agent-code-server agent-server-hint">
      <span>Server address</span>
      <code>{info.data.serverUrl}</code>
      <Button size="sm" variant="ghost" onClick={() => onCopy(info.data?.serverUrl ?? "")}>
        <Copy size={12} /> Copy
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------ Pairing setup */

function AgentSetup({
  pairing,
  generating,
  onGenerate,
  onInstall,
  installing,
  onCopy,
  downloadAvailable,
  devices,
  onRevoke,
  revokingId,
}: {
  pairing: PairingCode | null;
  generating: boolean;
  onGenerate: () => void;
  onInstall: () => void;
  installing: boolean;
  onCopy: (value: string) => void;
  downloadAvailable: boolean;
  devices: RemoteAgentDevice[];
  onRevoke: (device: RemoteAgentDevice) => void;
  revokingId: number | null;
}) {
  const code = pairing?.code ?? "";
  const serverUrl = pairing?.serverUrl ?? "";
  const launchLink = pairing
    ? `supportiq-agent://pair?server=${encodeURIComponent(serverUrl)}&code=${encodeURIComponent(code)}`
    : "";

  return (
    <div className="agent-setup">
      <ol className="agent-steps">
        <li>
          <span>
            <b>Install the SupportIQ Agent</b>
            <small>Windows 10 or 11. One click, no admin rights needed.</small>
          </span>
          <div className="agent-install">
            <Button
              size="sm"
              onClick={onInstall}
              loading={installing}
              disabled={!downloadAvailable}
            >
              <Download size={14} /> Install automatically
            </Button>
            <a
              className={`link-button ${downloadAvailable ? "" : "is-disabled"}`}
              href={downloadAvailable ? "/api/agent/download" : undefined}
              aria-disabled={!downloadAvailable}
            >
              just the .exe
            </a>
          </div>
        </li>
        <li>
          <span>
            <b>Pairing is automatic</b>
            <small>The installer starts the agent and connects it with this code.</small>
          </span>
          {pairing ? (
            <Button size="sm" variant="soft" onClick={onGenerate} loading={generating}>
              <RefreshCw size={13} /> New code
            </Button>
          ) : (
            <Button size="sm" variant="soft" onClick={onGenerate} loading={generating}>
              Get code
            </Button>
          )}
        </li>
        <li>
          <span>
            <b>Leave the agent running</b>
            <small>Approve each remote session from its visible prompt.</small>
          </span>
        </li>
      </ol>

      {pairing ? (
        <div className="agent-code">
          <div className="agent-code-head">
            <span>Pairing code</span>
            <span className="muted">expires in {formatSpan(new Date(pairing.expiresAt).getTime() - Date.now())}</span>
          </div>
          <div className="agent-code-value">
            <strong>{pairing.code}</strong>
            <Button size="sm" variant="secondary" onClick={() => onCopy(pairing.code)}>
              <Copy size={13} /> Copy
            </Button>
          </div>
          <div className="agent-code-server">
            <span>Server</span>
            <code>{pairing.serverUrl}</code>
            <Button size="sm" variant="ghost" onClick={() => onCopy(pairing.serverUrl)}>
              <Copy size={12} />
            </Button>
          </div>
          <a className="link-button" href={launchLink}>
            <Monitor size={12} /> Open the agent with this code
          </a>
          <p className="agent-code-hint">
            The one-click installer pairs this PC automatically. Run it before the code expires.
            If you prefer, launch the .exe and enter the server and code manually.
          </p>
        </div>
      ) : (
        <div className="agent-code is-empty">
          <p>Generate a code when you're ready to install or repair the agent on this PC.</p>
        </div>
      )}

      {devices.length > 0 ? (
        <div className="agent-devices">
          {devices.map((device) => (
            <div className="agent-device" key={device.id}>
              <span className="agent-device-icon">
                <Monitor size={14} />
              </span>
              <div>
                <strong>{device.name}</strong>
                <p>Paired {relativeTime(device.createdAt)}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRevoke(device)}
                loading={revokingId === device.id}
              >
                Forget
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------- Unattended access UI */

const DEVICE_ONLINE_MS = 90 * 1000;

function deviceIsOnline(device: RemoteAgentDevice): boolean {
  if (!device.lastSeenAt) return false;
  return Date.now() - new Date(device.lastSeenAt).getTime() < DEVICE_ONLINE_MS;
}

function UnattendedConnect({
  ticketId,
  customerName,
  devices,
  loading,
  compact = false,
  onConnected,
  onChanged,
}: {
  ticketId: number;
  customerName: string;
  devices: RemoteAgentDevice[];
  loading: boolean;
  compact?: boolean;
  onConnected: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const enabled = devices.filter((device) => device.unattendedEnabled);
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [setupDeviceId, setSetupDeviceId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);

  async function savePassword(targetId: number) {
    if (newPassword.length < 8) {
      toast("Use a connect-anytime password of at least 8 characters.", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast("The passwords don't match.", "error");
      return;
    }
    setSaving(true);
    try {
      await api.put(`/api/remote-sessions/ticket/${ticketId}/devices/${targetId}/unattended`, {
        enabled: true,
        password: newPassword,
      });
      setPassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setChanging(false);
      toast(
        "Saved. Connect with this password any time — no Allow click needed on that PC.",
        "info",
      );
      onChanged();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;
  if (devices.length === 0) {
    return (
      <p className="remote-unattended-hint">
        <KeyRound size={12} />
        Pair the customer's computer first. Then you can set a connect-anytime password here.
      </p>
    );
  }

  const setupId =
    setupDeviceId !== null && devices.some((device) => device.id === setupDeviceId)
      ? setupDeviceId
      : devices[0].id;

  const setupForm = (
    <div className="device-unattended-form">
      {devices.length > 1 ? (
        <select
          className="select"
          aria-label="Customer PC"
          value={setupId}
          onChange={(event) => setSetupDeviceId(Number(event.target.value))}
        >
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name}
              {device.unattendedEnabled ? " (password set)" : ""}
            </option>
          ))}
        </select>
      ) : null}
      <input
        className="input"
        type="password"
        autoComplete="new-password"
        minLength={8}
        placeholder="Connect-anytime password (8+ characters)"
        aria-label="Connect-anytime password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
      />
      <input
        className="input"
        type="password"
        autoComplete="new-password"
        minLength={8}
        placeholder="Repeat password"
        aria-label="Repeat connect-anytime password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void savePassword(setupId);
        }}
      />
      <Button size="sm" onClick={() => void savePassword(setupId)} loading={saving}>
        <KeyRound size={14} /> Save password
      </Button>
    </div>
  );

  if (enabled.length === 0) {
    return (
      <div className={`remote-unattended ${compact ? "is-compact" : ""}`}>
        <div className="remote-unattended-head">
          <span className="remote-unattended-icon">
            <KeyRound size={14} />
          </span>
          <div>
            <strong>Connect anytime</strong>
            <p>Set a password once for {customerName}'s PC and skip the Allow prompt later.</p>
          </div>
        </div>
        {setupForm}
        <p className="remote-unattended-offline">
          <TriangleAlert size={12} /> {customerName} still sees the red Stop sharing bar and can turn
          this off from their portal at any time.
        </p>
      </div>
    );
  }

  const activeId =
    deviceId !== null && enabled.some((device) => device.id === deviceId)
      ? deviceId
      : enabled[0].id;
  const activeDevice = enabled.find((device) => device.id === activeId) ?? enabled[0];
  const activeOnline = deviceIsOnline(activeDevice);

  async function connect() {
    if (!password) {
      toast("Enter the unattended access password.", "error");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/remote-sessions/unattended", {
        ticketId,
        deviceId: activeId,
        password,
      });
      setPassword("");
      toast("Connected without a prompt. The customer can still stop sharing at any time.", "info");
      onConnected();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`remote-unattended ${compact ? "is-compact" : ""}`}>
      <div className="remote-unattended-head">
        <span className="remote-unattended-icon">
          <KeyRound size={14} />
        </span>
        <div>
          <strong>Connect anytime</strong>
          <p>Use the password saved for this PC to skip the Allow prompt.</p>
        </div>
        <button className="link-button" onClick={() => setChanging((open) => !open)}>
          <KeyRound size={12} /> {changing ? "Cancel" : "New password"}
        </button>
      </div>
      {changing ? setupForm : null}
      <div className="remote-unattended-form">
        <select
          className="select"
          aria-label="Customer PC"
          value={activeId}
          onChange={(event) => setDeviceId(Number(event.target.value))}
        >
          {enabled.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name}
              {device.agentVersion ? ` · agent ${device.agentVersion}` : ""}
              {deviceIsOnline(device) ? "" : " (offline)"}
            </option>
          ))}
        </select>
        <input
          className="input"
          type="password"
          autoComplete="off"
          placeholder="Unattended access password"
          aria-label="Unattended access password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void connect();
          }}
        />
        <Button size="sm" onClick={() => void connect()} loading={busy}>
          <KeyRound size={14} /> Connect
        </Button>
      </div>
      {activeOnline ? null : (
        <p className="remote-unattended-offline">
          <TriangleAlert size={12} /> {activeDevice.name} hasn&apos;t checked in recently. Make sure
          the SupportIQ Agent is running on that PC before connecting.
        </p>
      )}
    </div>
  );
}

function DeviceCard({
  device,
  forgetting,
  onForget,
  onChanged,
}: {
  device: RemoteAgentDevice;
  forgetting: boolean;
  onForget: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function savePassword() {
    if (password.length < 8) {
      toast("Use an unattended access password of at least 8 characters.", "error");
      return;
    }
    if (password !== confirm) {
      toast("The passwords don't match.", "error");
      return;
    }
    setBusy(true);
    try {
      await api.put(`/api/agent/devices/${device.id}/unattended`, {
        enabled: true,
        password,
      });
      setPassword("");
      setConfirm("");
      setEditing(false);
      toast("Unattended access is on. Share the password with IT when you need help.", "info");
      onChanged();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      await api.put(`/api/agent/devices/${device.id}/unattended`, { enabled: false });
      setEditing(false);
      toast("Unattended access is off. IT will need your approval for each session.", "info");
      onChanged();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="agent-device-card">
      <div className="agent-device">
        <span className="agent-device-icon">
          <Monitor size={14} />
        </span>
        <div>
          <strong>{device.name}</strong>
          <p>
            Paired {relativeTime(device.createdAt)}
            {device.lastSeenAt ? ` · last seen ${relativeTime(device.lastSeenAt)}` : ""}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onForget} loading={forgetting}>
          Forget
        </Button>
      </div>
      <div className={`device-unattended ${device.unattendedEnabled ? "is-on" : ""}`}>
        <div className="device-unattended-row">
          <span className="device-unattended-status">
            <KeyRound size={12} />
            Unattended access {device.unattendedEnabled ? "on" : "off"}
            {device.unattendedEnabled && device.unattendedUpdatedAt
              ? ` · updated ${relativeTime(device.unattendedUpdatedAt)}`
              : ""}
          </span>
          <div className="device-unattended-actions">
            {device.unattendedEnabled ? (
              <>
                <button
                  className="link-button"
                  onClick={() => {
                    setEditing(true);
                    setPassword("");
                    setConfirm("");
                  }}
                  disabled={busy}
                >
                  Change password
                </button>
                <button className="link-button" onClick={() => void turnOff()} disabled={busy}>
                  Turn off
                </button>
              </>
            ) : (
              <button className="link-button" onClick={() => setEditing(true)} disabled={busy}>
                Set password
              </button>
            )}
          </div>
        </div>
        <p className="device-unattended-note">
          {device.unattendedEnabled
            ? "IT can start a session with this password without asking. You still see the red bar and can stop sharing any time."
            : "Set a password once so IT can connect when you're away from the keyboard."}
        </p>
        {editing ? (
          <div className="device-unattended-form">
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              placeholder="New password (8+ characters)"
              aria-label="New unattended access password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              placeholder="Repeat password"
              aria-label="Repeat unattended access password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
            <div className="device-unattended-form-actions">
              <Button size="sm" onClick={() => void savePassword()} loading={busy}>
                Save password
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- Live screen UI */

function RemoteViewer({
  session,
  canControl = true,
  onEnd,
  ending,
}: {
  session: RemoteSession;
  canControl?: boolean;
  onEnd: () => void;
  ending: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const pendingRef = useRef<InputEvent[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const framesRef = useRef(0);
  const [status, setStatus] = useState<"waiting" | "live" | "stalled">("waiting");
  const [resolution, setResolution] = useState<{ width: number; height: number } | null>(null);
  const [fps, setFps] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  /* Frames ---------------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    const tick = async () => {
      if (cancelled) return;
      try {
        const response = await fetch(`/api/remote-sessions/${session.id}/frame`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (response.status === 200) {
          const blob = await response.blob();
          const bitmap = await createImageBitmap(blob);
          const canvas = canvasRef.current;
          if (canvas) {
            if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
              setResolution({ width: bitmap.width, height: bitmap.height });
            }
            const context = canvas.getContext("2d");
            if (context) context.drawImage(bitmap, 0, 0);
            lastFrameRef.current = Date.now();
            framesRef.current += 1;
            setStatus("live");
          }
          bitmap.close();
        } else if (response.status === 401 || response.status === 403) {
          setStatus("stalled");
        }
      } catch {
        if (!cancelled) setStatus("stalled");
      }
      if (!cancelled) timer = window.setTimeout(tick, LIVE_VIEWER_INTERVAL_MS);
    };

    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [session.id]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      setStatus((current) =>
        lastFrameRef.current > 0 && now - lastFrameRef.current < 2500 ? "live" : current === "live" ? "stalled" : "waiting",
      );
      const frames = framesRef.current;
      framesRef.current = 0;
      setFps(frames);
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Keep an approved session alive while the technician is watching.
  useEffect(() => {
    const interval = window.setInterval(() => {
      void api.post(`/api/remote-sessions/${session.id}/keepalive`).catch(() => undefined);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [session.id]);

  /* Input batching -------------------------------------------------------- */
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
      const events = pendingRef.current;
      pendingRef.current = [];
      if (events.length > 0) {
        void fetch(`/api/remote-sessions/${session.id}/input`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events }),
          keepalive: true,
        }).catch(() => undefined);
      }
    };
  }, [session.id]);

  function flushInput() {
    flushTimerRef.current = null;
    const events = pendingRef.current;
    pendingRef.current = [];
    if (events.length === 0) return;
    void fetch(`/api/remote-sessions/${session.id}/input`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    })
      .then(async (response) => {
        if (response.ok) {
          setInputError(null);
          return;
        }
        if (response.status === 409) {
          setInputError("The session ended. Ask for a new session to keep controlling this PC.");
          return;
        }
        let message = response.status === 403
          ? `Only ${session.requestedBy.name} can control this session.`
          : "Input couldn't reach the customer's PC.";
        try {
          const payload = (await response.json()) as { error?: string };
          if (payload?.error) message = payload.error;
        } catch {
          // Keep the status-based message when the body isn't JSON.
        }
        setInputError(message);
      })
      .catch(() => setInputError("Input couldn't reach the customer's PC."));
  }

  function enqueue(event: InputEvent) {
    if (!canControl) return;
    pendingRef.current.push(event);
    if (flushTimerRef.current === null) {
      flushTimerRef.current = window.setTimeout(flushInput, INPUT_FLUSH_MS);
    }
  }

  /* Pointer --------------------------------------------------------------- */
  function contentPoint(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const aspect = canvas.width / canvas.height;
    let width = rect.width;
    let height = rect.height;
    if (rect.width / rect.height > aspect) width = rect.height * aspect;
    else height = rect.width / aspect;
    const left = rect.left + (rect.width - width) / 2;
    const top = rect.top + (rect.height - height) / 2;
    const x = (clientX - left) / width;
    const y = (clientY - top) / height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }

  function placeCursor(clientX: number, clientY: number) {
    const node = cursorRef.current;
    const wrap = wrapRef.current;
    if (!node || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    node.style.transform = `translate(${clientX - rect.left}px, ${clientY - rect.top}px)`;
    node.style.opacity = "1";
  }

  function hideCursor() {
    if (cursorRef.current) cursorRef.current.style.opacity = "0";
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    placeCursor(event.clientX, event.clientY);
    const point = contentPoint(event.clientX, event.clientY);
    if (point) enqueue({ t: "m", ...point });
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    wrapRef.current?.focus();
    placeCursor(event.clientX, event.clientY);
    const point = contentPoint(event.clientX, event.clientY);
    if (point) enqueue({ t: "m", ...point });
    if (event.button === 0 || event.button === 1 || event.button === 2) {
      enqueue({ t: "md", b: event.button });
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.button === 0 || event.button === 1 || event.button === 2) {
      enqueue({ t: "mu", b: event.button });
    }
  }

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      enqueue({ t: "w", d: Math.sign(event.deltaY) });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  /* Keyboard -------------------------------------------------------------- */
  function keyToken(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key.length === 1) {
      const printable = event.ctrlKey || event.altKey || event.metaKey ? event.key.toLowerCase() : event.key;
      return { k: printable, c: event.code };
    }
    if (event.key.startsWith("Arrow")) return { k: event.key, c: event.code };
    if (/^F([1-9]|1[0-2])$/.test(event.key)) return { k: event.key, c: event.code };
    const named = new Set([
      "Enter",
      "Backspace",
      "Tab",
      "Escape",
      "Delete",
      "Insert",
      "Home",
      "End",
      "PageUp",
      "PageDown",
      "Control",
      "Shift",
      "Alt",
      "Meta",
      "CapsLock",
      "NumLock",
      "ScrollLock",
      "Pause",
      "ContextMenu",
      "PrintScreen",
    ]);
    return named.has(event.key) ? { k: event.key, c: event.code } : null;
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const token = keyToken(event);
    if (!token) return;
    event.preventDefault();
    enqueue({ t: "kd", ...token });
  }

  function onKeyUp(event: React.KeyboardEvent<HTMLDivElement>) {
    const token = keyToken(event);
    if (!token) return;
    event.preventDefault();
    enqueue({ t: "ku", ...token });
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void viewerRef.current?.requestFullscreen?.();
  }

  const aspect = resolution ? resolution.width / resolution.height : 16 / 9;

  return (
    <div className={`remote-viewer ${fullscreen ? "is-fullscreen" : ""}`} ref={viewerRef}>
      <div className="remote-viewer-bar">
        <span className={`remote-live ${status === "live" ? "is-live" : ""}`}>
          <span className="remote-live-dot" />
          {status === "live" ? "Live" : status === "stalled" ? "Reconnecting" : "Waiting for screen"}
        </span>
        <span className="remote-viewer-meta">
          {resolution ? `${resolution.width} × ${resolution.height}` : "—"}
          {fps > 0 ? ` · ~${fps} fps` : ""}
        </span>
        <span className="remote-viewer-spacer" />
        <span className="remote-viewer-agent">
          <Monitor size={13} /> {session.agent?.name ?? session.customer.name}
        </span>
        <button className="remote-icon-btn" onClick={toggleFullscreen} title="Fullscreen">
          {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        <Button size="sm" variant="danger" onClick={onEnd} loading={ending}>
          <Unplug size={14} /> End
        </Button>
      </div>

      <div
        className={`remote-screen ${canControl ? "" : "is-view-only"}`}
        ref={wrapRef}
        tabIndex={canControl ? 0 : -1}
        onPointerMove={canControl ? onPointerMove : undefined}
        onPointerDown={canControl ? onPointerDown : undefined}
        onPointerUp={canControl ? onPointerUp : undefined}
        onPointerEnter={
          canControl
            ? (event) => placeCursor(event.clientX, event.clientY)
            : undefined
        }
        onPointerLeave={canControl ? hideCursor : undefined}
        onKeyDown={canControl ? onKeyDown : undefined}
        onKeyUp={canControl ? onKeyUp : undefined}
        onContextMenu={(event) => event.preventDefault()}
        style={{ aspectRatio: `${aspect}` }}
        aria-label={canControl ? "Remote screen" : "Remote screen (view only)"}
      >
        <canvas ref={canvasRef} width={1280} height={720} />
        {canControl ? (
          <div ref={cursorRef} className="remote-cursor" aria-hidden="true">
            <svg width="16" height="24" viewBox="0 0 16 24" fill="none">
              <path
                d="M1 1L14.2 12.1L8.1 13.2L11.3 20.5L8.9 21.6L5.7 14.2L1 18.6V1Z"
                fill="#fff"
                stroke="#111"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ) : null}
        {status !== "live" ? (
          <div className="remote-screen-empty">
            <LoaderCircle size={22} className="spin" />
            <strong>
              {status === "stalled" ? "Reconnecting to the agent…" : "Waiting for the first frame…"}
            </strong>
            <p>Ask {session.customer.name} to keep the SupportIQ Agent open.</p>
          </div>
        ) : null}
        <div className={`remote-screen-hint ${canControl ? "" : "is-hidden"}`}>
          <Keyboard size={12} /> Click the screen to send keyboard input
        </div>
        {!canControl ? (
          <div className="remote-screen-viewonly">
            <LockKeyhole size={18} />
            <strong>View only</strong>
            <p>Only {session.requestedBy.name} can control this computer.</p>
          </div>
        ) : null}
      </div>

      <div className="remote-viewer-foot">
        <span>
          <ShieldCheck size={13} />
          {canControl
            ? `You are controlling ${session.customer.name}'s computer. This session is visible to them and can be stopped at any time.`
            : `You are viewing ${session.customer.name}'s computer. ${session.requestedBy.name} controls the mouse and keyboard.`}
        </span>
        {inputError ? <span className="error-text">{inputError}</span> : null}
      </div>
    </div>
  );
}
