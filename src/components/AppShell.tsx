import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Bell,
  ChevronRight,
  CircleCheck,
  CircleX,
  ContactRound,
  FileText,
  Gauge,
  Headset,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Plus,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Ticket,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { callSecureContext } from "../lib/calls";
import { ROLE_LABEL, relativeTime } from "../lib/format";
import { api, errorMessage } from "../lib/api";
import { useApi, useRealtime } from "../lib/hooks";
import type { NotificationsResponse, TicketListResponse } from "../lib/types";
import { Avatar, BackButton, IconButton, LiveBadge, type IconType } from "./ui";
import { useToast } from "./toast";

export type PortalKey = "customer" | "it" | "admin";

type NavItem = {
  to: string;
  label: string;
  icon: IconType;
  end?: boolean;
  badge?: "unread" | "open" | "late";
};

const PORTAL_HOME: Record<PortalKey, string> = {
  customer: "/portal",
  it: "/agent",
  admin: "/admin",
};

const PORTALS: Record<PortalKey, { label: string; subtitle: string; items: NavItem[] }> = {
  customer: {
    label: "Customer portal",
    subtitle: "Help, tracked",
    items: [
      { to: "/portal", label: "Overview", icon: LayoutDashboard, end: true },
      { to: "/portal/assistant", label: "Support assistant", icon: Sparkles },
      { to: "/portal/requests", label: "My requests", icon: MessagesSquare, badge: "unread" },
      { to: "/portal/requests/new", label: "New request", icon: Plus },
      { to: "/portal/status", label: "Connection check", icon: Activity },
      { to: "/portal/settings", label: "Settings", icon: Settings },
    ],
  },
  it: {
    label: "IT support portal",
    subtitle: "Resolution desk",
    items: [
      { to: "/agent", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/agent/reports", label: "My reports", icon: FileText },
      { to: "/agent/queue", label: "Queue", icon: Inbox, badge: "open" },
      { to: "/agent/resolved", label: "Resolved", icon: CircleCheck },
      { to: "/agent/messages", label: "Messages", icon: MessagesSquare },
      { to: "/agent/status", label: "Connection check", icon: Activity },
      { to: "/agent/settings", label: "Settings", icon: Settings },
    ],
  },
  admin: {
    label: "Admin monitoring",
    subtitle: "Operations control",
    items: [
      { to: "/admin", label: "Dashboard", icon: Gauge, end: true },
      { to: "/admin/reports", label: "Reports", icon: FileText },
      { to: "/admin/requests", label: "All requests", icon: Ticket, badge: "late" },
      { to: "/admin/conversations", label: "Assistant conversations", icon: MessagesSquare },
      { to: "/admin/automation", label: "Automation", icon: Zap },
      { to: "/admin/team", label: "IT team", icon: Users },
      { to: "/admin/accounts", label: "Accounts", icon: ContactRound },
      { to: "/admin/permissions", label: "Permissions", icon: ShieldCheck },
      { to: "/admin/messages", label: "Messages", icon: MessagesSquare },
      { to: "/admin/status", label: "Connection check", icon: Activity },
      { to: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
};

export function AppShell({ portal, children }: { portal: PortalKey; children: ReactNode }) {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [mediaWarningDismissed, setMediaWarningDismissed] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifBusy, setNotifBusy] = useState<number | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const config = PORTALS[portal];
  const callSecurity = callSecureContext();

  const ticketFeed = useApi<TicketListResponse>(
    () => api.get<TicketListResponse>("/api/tickets?limit=100"),
    [portal],
    { enabled: Boolean(user) },
  );
  const notifications = useApi<NotificationsResponse>(
    () => api.get<NotificationsResponse>("/api/notifications"),
    [portal],
    { enabled: Boolean(user) },
  );
  const liveStatus = useRealtime(
    (event) => {
      ticketFeed.reload();
      notifications.reload();
      if (event.type === "notification:new" && event.notificationType === "co_helper_request") {
        toast(`${event.requesterName ?? "A teammate"} needs a co-helper${event.ref ? ` on ${event.ref}` : ""}.`, "info");
      }
      const target = event.ref ? ` ${event.ref}` : " a request";
      if (event.type === "ticket:admin-help") {
        const who = event.agentName ?? "IT support";
        const reason = event.reason ? ` Reason: ${event.reason}` : "";
        toast(`${who} requested admin help on${target}.${reason}`, "info");
        return;
      }
      if (event.type !== "ticket:approval" || !event.decision) return;
      const who = event.customerName ?? "The customer";
      if (event.decision === "approved") {
        toast(`${who} approved the resolution for${target}.`, "success");
      } else {
        const reason = event.reason ? ` Reason: ${event.reason}` : "";
        toast(`${who} rejected the resolution for${target}.${reason}`, "error");
      }
    },
    Boolean(user),
  );

  useEffect(() => {
    setOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!notifOpen) return;
    const close = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [notifOpen, notifRef]);

  const ticketHref = (ticketId: number) =>
    portal === "admin" ? `/admin/requests/${ticketId}` : `/agent/tickets/${ticketId}`;

  const openNotification = async (id: number, ticketId: number | null) => {
    setNotifOpen(false);
    if (ticketId) navigate(ticketHref(ticketId));
    try {
      await api.post(`/api/notifications/${id}/read`);
    } finally {
      notifications.reload();
    }
  };

  const respondToCoHelper = async (id: number, requestId: number, accept: boolean) => {
    setNotifBusy(requestId);
    try {
      const result = await api.post<{ ok?: boolean; requestOpen?: boolean; ticket?: { id: number } }>(
        `/api/co-helper-requests/${requestId}/${accept ? "accept" : "decline"}`,
      );
      if (accept) {
        toast("You're now a co-helper on that request.", "success");
        await api.post(`/api/notifications/${id}/read`).catch(() => undefined);
        setNotifOpen(false);
        if (result.ticket?.id) navigate(ticketHref(result.ticket.id));
      } else {
        toast(result.requestOpen ? "Passed — the team can still pick it up." : "Request declined.", "info");
      }
      notifications.reload();
      ticketFeed.reload();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setNotifBusy(null);
    }
  };

  const badges = useMemo(() => {
    const tickets = ticketFeed.data?.tickets ?? [];
    if (portal === "customer") {
      const unread = tickets.reduce(
        (total, ticket) =>
          total + (ticket.status === "resolved" || ticket.status === "closed" ? 0 : ticket.unreadCount),
        0,
      );
      return { unread } as const;
    }
    if (portal === "it") {
      return { open: tickets.filter((ticket) => ticket.status !== "resolved" && ticket.status !== "closed").length } as const;
    }
    return { late: tickets.filter((ticket) => ticket.isLate).length } as const;
  }, [ticketFeed.data, portal]);

  const unreadNotifications = notifications.data?.unread ?? 0;
  const notifItems = notifications.data?.notifications ?? [];

  const markAllRead = async () => {
    try {
      await api.post("/api/notifications/read-all");
    } finally {
      notifications.reload();
    }
  };

  const isNavPage = config.items.some((item) => item.to === location.pathname);
  // Detail pages render their own contextual back link, so skip the topbar one there.
  const pageHasOwnBack = /^\/(?:portal\/requests|agent\/tickets|admin\/requests)\/\d+$/.test(location.pathname);

  const section = useMemo(() => {
    const sorted = [...config.items].sort((a, b) => b.to.length - a.to.length);
    const match = sorted.find(
      (item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
    );
    return match?.label ?? "Workspace";
  }, [config.items, location.pathname]);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? "is-open" : ""}`} aria-label="Primary navigation">
        <div className="brand">
          <span className="brand-mark">
            <Headset size={17} strokeWidth={2.1} />
          </span>
          <div className="brand-text">
            <strong>SupportIQ</strong>
            <span className="brand-sub">{config.subtitle}</span>
          </div>
          <IconButton label="Close navigation" className="sidebar-close" onClick={() => setOpen(false)}>
            <X size={18} />
          </IconButton>
        </div>

        <p className="portal-tag">{config.label}</p>

        <nav className="nav">
          {config.items.map((item) => {
            const Icon = item.icon;
            const count = item.badge ? badges[item.badge] ?? 0 : 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                {count > 0 ? (
                  <span className={`nav-badge ${item.badge === "late" ? "is-danger" : ""}`}>{count}</span>
                ) : null}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-note">
          <p>Every conversation stays inside SupportIQ.</p>
          <span>No sales or promotional messages from the support assistant.</span>
        </div>

        <div className="sidebar-foot">
          <div className="user-chip">
            <Avatar name={user?.name ?? "Support"} size="sm" />
            <div className="user-chip-text">
              <span className="name">{user?.name}</span>
              <span className="role">{user ? ROLE_LABEL[user.role] : ""}</span>
            </div>
          </div>
          <IconButton label="Sign out" className="signout" onClick={signOut} disabled={signingOut}>
            <LogOut size={17} />
          </IconButton>
        </div>
      </aside>

      <button
        type="button"
        className={`scrim ${open ? "is-open" : ""}`.trim()}
        aria-label="Close navigation"
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        onClick={() => setOpen(false)}
      />

      <div className="main">
        <header className="topbar">
          <IconButton label="Open navigation" className="menu-btn" onClick={() => setOpen(true)}>
            <Menu size={19} />
          </IconButton>
          {isNavPage || pageHasOwnBack ? null : <BackButton fallback={PORTAL_HOME[portal]} />}
          <div className="crumb">
            <span>{config.label}</span>
            <ChevronRight size={13} />
            <strong>{section}</strong>
          </div>
          <div className="topbar-right">
            {portal !== "customer" ? (
              <div className="notif-wrap" ref={notifRef}>
              <button
                type="button"
                className="notif-btn"
                aria-label={unreadNotifications ? `Notifications, ${unreadNotifications} unread` : "Notifications"}
                aria-expanded={notifOpen}
                onClick={() => setNotifOpen((value) => !value)}
              >
                <Bell size={18} />
                {unreadNotifications > 0 ? (
                  <span className="notif-count">{unreadNotifications > 9 ? "9+" : unreadNotifications}</span>
                ) : null}
              </button>
              {notifOpen ? (
                <div className="notif-panel" role="dialog" aria-label="Notifications">
                  <div className="notif-head">
                    <strong>Notifications</strong>
                    {unreadNotifications > 0 ? (
                      <button type="button" className="link-button" onClick={() => void markAllRead()}>
                        Mark all read
                      </button>
                    ) : null}
                  </div>
                  {notifItems.length === 0 ? (
                    <p className="notif-empty">You're all caught up.</p>
                  ) : (
                    <ul className="notif-list">
                      {notifItems.map((item) => {
                        const canRespond =
                          item.type === "co_helper_request" &&
                          item.requestStatus === "pending" &&
                          item.requestId != null;
                        return (
                          <li key={item.id} className={`notif-item ${item.readAt ? "" : "is-unread"}`.trim()}>
                            <button
                              type="button"
                              className="notif-item-body"
                              onClick={() => void openNotification(item.id, item.ticketId)}
                            >
                              <span className="notif-item-title">{item.title}</span>
                              {item.body ? <span className="notif-item-text">{item.body}</span> : null}
                              <span className="notif-item-meta">
                                {item.ticketRef ? `${item.ticketRef} · ` : ""}
                                {relativeTime(item.createdAt)}
                              </span>
                            </button>
                            {canRespond ? (
                              <div className="notif-actions">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  disabled={notifBusy === item.requestId}
                                  onClick={() =>
                                    void respondToCoHelper(item.id, item.requestId as number, true)
                                  }
                                >
                                  <CircleCheck size={14} /> Accept
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-secondary"
                                  disabled={notifBusy === item.requestId}
                                  onClick={() =>
                                    void respondToCoHelper(item.id, item.requestId as number, false)
                                  }
                                >
                                  <CircleX size={14} /> Decline
                                </button>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}
              </div>
            ) : null}
            <LiveBadge status={liveStatus} />
            <div className="topbar-user">
              <Avatar name={user?.name ?? "Support"} size="sm" />
              <span>{user?.name}</span>
            </div>
          </div>
        </header>
        {!callSecurity.secure && !mediaWarningDismissed ? (
          <div className="call-security-banner" role="status">
            <ShieldAlert size={18} />
            <div className="call-security-text">
              <strong>Voice and video calls are blocked on this address</strong>
              <span>
                You're on <code>{callSecurity.origin}</code>. Browsers only allow the camera and
                microphone on secure addresses. On this computer, use{" "}
                <code>{callSecurity.localUrl}</code>. On a phone or another device, open{" "}
                <a href={callSecurity.httpsUrl}>{callSecurity.httpsUrl}</a> and accept the
                certificate warning. You can install the certificate from{" "}
                <a href={`${callSecurity.httpsUrl}/dev-cert.cer`}>/dev-cert.cer</a>.
              </span>
            </div>
            <button
              type="button"
              className="call-security-dismiss"
              onClick={() => setMediaWarningDismissed(true)}
              aria-label="Dismiss secure-connection notice"
            >
              <X size={16} />
            </button>
          </div>
        ) : null}
        <main className="content" key={location.pathname}>
          {children}
        </main>
      </div>
    </div>
  );
}
