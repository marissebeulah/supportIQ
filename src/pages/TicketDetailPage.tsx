import { Fragment, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock3,
  FileText,
  Lock,
  MessageSquare,
  Paperclip,
  Send,
  Sparkles,
  Star,
  Timer,
  TriangleAlert,
  Flag,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  ShieldCheck,
  Video,
  X,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { api, errorMessage } from "../lib/api";
import { useCall } from "../lib/calls";
import { useApi, useRealtime, useTitle } from "../lib/hooks";
import {
  ROLE_LABEL,
  STATUS_META,
  dueStatus,
  fileSize,
  formatDateTime,
  formatDay,
  formatTime,
  isImage,
  relativeTime,
} from "../lib/format";
import type {
  Attachment,
  CallKind,
  CallRecord,
  CannedReply,
  MessageRole,
  Priority,
  Status,
  TicketDetail,
  TicketDetailResponse,
  TicketMessage,
} from "../lib/types";
import type { PortalKey } from "../components/AppShell";
import {
  Avatar,
  Button,
  Card,
  CardHead,
  ConfirmDialog,
  ErrorNote,
  Field,
  Modal,
  PriorityPill,
  ProductPill,
  Select,
  Spinner,
  Stars,
  StatusPill,
} from "../components/ui";
import { uploadAttachmentFile } from "../components/AttachmentUpload";
import { RemoteSupportPanel } from "../components/RemoteSupportPanel";
import { useToast } from "../components/toast";

const BACK_TO: Record<PortalKey, string> = {
  customer: "/portal/requests",
  it: "/agent",
  admin: "/admin/requests",
};

const PRIORITY_OPTIONS: Priority[] = ["low", "normal", "high", "urgent"];
const STATUS_OPTIONS: Status[] = ["open", "in_progress", "waiting_customer", "resolved", "closed"];

const ROLE_TAG: Partial<Record<MessageRole, string>> = {
  customer: "Customer",
  it: "IT support",
  admin: "Admin",
};

export default function TicketDetailPage({ portal }: { portal: PortalKey }) {
  const { id } = useParams();
  const ticketId = Number(id);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<"resolved" | "closed" | null>(null);
  const [summary, setSummary] = useState("");
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [adminHelpOpen, setAdminHelpOpen] = useState(false);
  const [adminHelpReason, setAdminHelpReason] = useState("");
  const [adminHelpError, setAdminHelpError] = useState<string | null>(null);
  const [requestingAdminHelp, setRequestingAdminHelp] = useState(false);
  useTitle("Request");

  const detail = useApi<TicketDetailResponse>(
    () => api.get<TicketDetailResponse>(`/api/tickets/${ticketId}`),
    [ticketId],
    { enabled: Number.isInteger(ticketId) && ticketId > 0 },
  );
  useRealtime(() => detail.reload());

  const ticket = detail.data?.ticket;
  const lastMessageId = ticket?.messages[ticket.messages.length - 1]?.id;

  useEffect(() => {
    if (!ticketId || !lastMessageId) return;
    api.post(`/api/tickets/${ticketId}/read`).catch(() => undefined);
  }, [ticketId, lastMessageId]);

  const apply = (response: TicketDetailResponse) => detail.setData(response);

  const patchTicket = async (path: string, body: unknown, key: string, message: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(key);
    try {
      const response = await api.patch<TicketDetailResponse>(`/api/tickets/${ticketId}/${path}`, body);
      apply(response);
      toast(message);
      return true;
    } catch (error) {
      toast(errorMessage(error), "error");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const changeStatus = (next: Status) => {
    if (!ticket || next === ticket.status) return;
    if (next === "resolved" || next === "closed") {
      setSummary(ticket.resolutionSummary ?? "");
      setResolveTarget(next);
      return;
    }
    void patchTicket("status", { status: next }, "status", `Status updated to ${STATUS_META[next].label}.`);
  };

  const confirmResolve = async () => {
    if (!resolveTarget || !ticket) return;
    if (summary.trim().length < 3 && !ticket.resolutionSummary) {
      toast("Add a short resolution summary first.", "error");
      return;
    }
    const ok = await patchTicket(
      "status",
      { status: resolveTarget, resolutionSummary: summary.trim() },
      "resolve",
      resolveTarget === "resolved" ? "Request marked resolved." : "Request closed.",
    );
    if (ok) setResolveTarget(null);
  };

  const assign = (assigneeId: number | null) => {
    void patchTicket(
      "assign",
      { assigneeId },
      "assign",
      assigneeId ? "Request assigned." : "Assignment cleared.",
    );
  };

  const changeProduct = (value: string) => {
    const productId = value === "none" ? null : Number(value);
    void patchTicket(
      "product",
      { productId },
      "product",
      productId ? "Product linked to this request." : "Product cleared.",
    );
  };

  const sendReply = async (body: string, internal: boolean, attachmentIds: number[]) => {
    const response = await api.post<TicketDetailResponse>(`/api/tickets/${ticketId}/messages`, {
      body,
      isInternal: internal,
      attachmentIds,
    });
    apply(response);
    toast(internal ? "Internal note added." : "Reply sent.");
  };

  const submitRating = async () => {
    if (rating < 1) {
      setRatingError("Choose a star rating before submitting.");
      return;
    }
    setRatingError(null);
    setBusy("rating");
    try {
      const response = await api.post<TicketDetailResponse>(`/api/tickets/${ticketId}/rating`, {
        rating,
        comment: ratingComment.trim(),
      });
      apply(response);
      toast("Thank you — your rating was saved.");
    } catch (error) {
      setRatingError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const approveRequest = async () => {
    setApproving(true);
    try {
      const response = await api.post<TicketDetailResponse>(`/api/tickets/${ticketId}/approve`);
      apply(response);
      setConfirmApprove(false);
      toast("Resolution approved — request closed.");
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setApproving(false);
    }
  };

  const rejectResolution = async () => {
    if (rejectReason.trim().length < 3) {
      setRejectError("Tell IT what still needs fixing.");
      return;
    }
    setRejecting(true);
    setRejectError(null);
    try {
      const response = await api.post<TicketDetailResponse>(`/api/tickets/${ticketId}/reject`, {
        reason: rejectReason.trim(),
      });
      apply(response);
      setRejectOpen(false);
      setRejectReason("");
      toast("Resolution rejected — request reopened for IT support.", "info");
    } catch (error) {
      setRejectError(errorMessage(error));
    } finally {
      setRejecting(false);
    }
  };

  const requestAdminHelp = async () => {
    if (adminHelpReason.trim().length < 3) {
      setAdminHelpError("Briefly explain what you need help with.");
      return;
    }
    setRequestingAdminHelp(true);
    setAdminHelpError(null);
    try {
      const response = await api.post<TicketDetailResponse>(`/api/tickets/${ticketId}/request-admin`, {
        reason: adminHelpReason.trim(),
      });
      apply(response);
      setAdminHelpOpen(false);
      setAdminHelpReason("");
      toast("Admin help requested — an admin has been notified.", "info");
    } catch (error) {
      setAdminHelpError(errorMessage(error));
    } finally {
      setRequestingAdminHelp(false);
    }
  };

  const dismissFlag = async (messageId: number) => {
    if (busy) return;
    setBusy(`dismiss-${messageId}`);
    try {
      const response = await api.post<TicketDetailResponse>(
        `/api/tickets/${ticketId}/messages/${messageId}/dismiss-flag`,
      );
      apply(response);
      toast("Flag dismissed.");
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(null);
    }
  };

  if (!Number.isInteger(ticketId) || ticketId < 1) {
    return <ErrorNote message="Request not found." />;
  }

  if (detail.loading && !ticket) {
    return <Spinner label="Opening request…" />;
  }

  if (!ticket) {
    return (
      <div>
        <button type="button" className="back-link" onClick={() => navigate(BACK_TO[portal])}>
          <ArrowLeft size={14} /> Back
        </button>
        <ErrorNote message={detail.error ?? "Request not found."} />
      </div>
    );
  }

  const responseDue = dueStatus(ticket.responseDueAt, ticket.firstResponseAt);
  const resolveDue = dueStatus(ticket.resolveDueAt, ticket.resolvedAt ?? ticket.closedAt);
  const isStaff = user?.role === "it" || user?.role === "admin";
  const canResolve = ticket.permissions.canChangeStatus && ticket.status !== "resolved" && ticket.status !== "closed";

  return (
    <div>
      <button type="button" className="back-link" onClick={() => navigate(BACK_TO[portal])}>
        <ArrowLeft size={14} /> {portal === "customer" ? "Back to my requests" : portal === "it" ? "Back to queue" : "Back to all requests"}
      </button>

      <header className="ticket-head">
        <div className="ticket-head-top">
          <span className="ref-chip">{ticket.ref}</span>
          <StatusPill status={ticket.status} />
          <PriorityPill priority={ticket.priority} />
          <ProductPill product={ticket.product} />
          {ticket.isLate ? (
            <span className="badge badge-late">
              <TriangleAlert size={12} /> {ticket.lateReason === "first_response" ? "Response overdue" : "Resolution overdue"}
            </span>
          ) : null}
          {isStaff && (ticket.isFlagged || ticket.flaggedCount > 0) ? (
            <span className="badge badge-flagged">
              <Flag size={12} /> Flagged{ticket.flaggedCount > 1 ? ` (${ticket.flaggedCount})` : ""}
            </span>
          ) : null}
          {ticket.channel === "assistant" ? (
            <span className="badge badge-bot">
              <Sparkles size={12} /> Via assistant
            </span>
          ) : null}
        </div>
        <h1 className="ticket-title">{ticket.subject}</h1>
        <p className="ticket-sub">
          <span>
            {portal === "customer"
              ? "Opened by you"
              : `${ticket.customer.name}${ticket.customer.company ? ` · ${ticket.customer.company}` : ""}`}
          </span>
          <span className="dot-sep">{formatDateTime(ticket.createdAt)}</span>
          <span className="dot-sep">{ticket.category}</span>
          {ticket.assignee ? (
            <span className="dot-sep">Assigned to {ticket.assignee.name}</span>
          ) : (
            <span className="dot-sep">Not yet assigned</span>
          )}
        </p>
        <CallActions ticket={ticket} />
      </header>

      <div className="detail" style={{ marginTop: 16 }}>
        <div className="detail-main">
          {ticket.adminHelpRequestedAt && isStaff ? (
            <div className="admin-help-banner">
              <ShieldCheck size={17} />
              <div>
                <p className="admin-help-head">
                  {user?.role === "admin" ? "IT support requested admin help" : "Admin help requested"}
                </p>
                {ticket.adminHelpReason ? <p className="admin-help-reason">{ticket.adminHelpReason}</p> : null}
                <p className="small muted">
                  Requested {relativeTime(ticket.adminHelpRequestedAt)}.{" "}
                  {user?.role === "admin"
                    ? "Reply below to step in — your message will be marked as an Admin intervention."
                    : "An admin has been notified and can join this conversation."}
                </p>
              </div>
            </div>
          ) : null}

          <RemoteSupportPanel ticket={ticket} />

          {ticket.permissions.canChangeStatus ? (
            <div className="workflow">
              <Field label="Status">
                <Select
                  value={ticket.status}
                  onChange={(event) => changeStatus(event.target.value as Status)}
                  disabled={busy !== null}
                  aria-label="Request status"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_META[status].label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority">
                <Select
                  value={ticket.priority}
                  onChange={(event) =>
                    void patchTicket(
                      "priority",
                      { priority: event.target.value },
                      "priority",
                      `Priority set to ${event.target.value}.`,
                    )
                  }
                  disabled={busy !== null}
                  aria-label="Request priority"
                >
                  {PRIORITY_OPTIONS.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority[0].toUpperCase() + priority.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>

              {portal === "admin" && detail.data ? (
                <Field label="Assignee">
                  <Select
                    value={ticket.assignee?.id ?? ""}
                    onChange={(event) => assign(event.target.value ? Number(event.target.value) : null)}
                    disabled={busy !== null}
                    aria-label="Assign request"
                  >
                    <option value="">Unassigned</option>
                    {detail.data.agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              {ticket.permissions.canChangeProduct ? (
                <Field label="Product">
                  <Select
                    value={ticket.product?.id ?? "none"}
                    onChange={(event) => changeProduct(event.target.value)}
                    disabled={busy !== null}
                    aria-label="Request product"
                  >
                    <option value="none">Not sure / not listed</option>
                    {(detail.data?.products ?? []).map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              <div className="workflow-actions">
                {ticket.permissions.canRequestAdminHelp ? (
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => {
                      setAdminHelpReason("");
                      setAdminHelpError(null);
                      setAdminHelpOpen(true);
                    }}
                  >
                    <ShieldCheck size={14} /> Request admin help
                  </Button>
                ) : null}
                {canResolve ? (
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => {
                      setSummary(ticket.resolutionSummary ?? "");
                      setResolveTarget("resolved");
                    }}
                  >
                    <CircleCheck size={14} /> Resolve request
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {ticket.resolutionSummary ? (
            <div className="resolution">
              <p className="resolution-head">
                <CircleCheck size={14} /> Resolution summary
              </p>
              <p>{ticket.resolutionSummary}</p>
            </div>
          ) : null}

          {ticket.rejectedAt ? (
            <div className="rejection-banner">
              <CircleAlert size={17} />
              <div>
                <p className="rejection-head">
                  {isStaff ? "Customer rejected the resolution" : "You rejected this resolution"}
                </p>
                {ticket.rejectionReason ? <p className="rejection-reason">{ticket.rejectionReason}</p> : null}
                <p className="small muted">Rejected {relativeTime(ticket.rejectedAt)}</p>
              </div>
            </div>
          ) : null}

          <section className="card">
            <Thread ticket={ticket} cannedReplies={detail.data?.cannedReplies ?? []} onSend={sendReply} onDismissFlag={isStaff ? dismissFlag : undefined} canModerate={isStaff} dismissingId={busy?.startsWith("dismiss-") ? Number(busy.slice(8)) : null} />
          </section>

          {portal === "customer" && (ticket.status === "resolved" || ticket.status === "closed") ? (
            <Card className="rating-card">
              {ticket.approvedAt ? (
                <div className="approval-banner">
                  <span className="approval-mark">
                    <CircleCheck size={18} />
                  </span>
                  <div>
                    <h2 className="rating-title">Resolution approved</h2>
                    <p className="rating-sub">
                      You approved this resolution {relativeTime(ticket.approvedAt)}. The request is closed.
                    </p>
                  </div>
                </div>
              ) : ticket.permissions.canApprove ? (
                <>
                  <p className="eyebrow">Awaiting your approval</p>
                  <h2 className="rating-title">Is this resolved?</h2>
                  <p className="rating-sub">
                    IT support marked this request resolved. Review the resolution summary and approve it to close
                    the request.
                  </p>
                  <div className="row" style={{ marginTop: 12 }}>
                    <Button onClick={() => setConfirmApprove(true)} loading={approving}>
                      <CircleCheck size={15} /> Approve resolution
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={approving}
                      onClick={() => {
                        setRejectReason("");
                        setRejectError(null);
                        setRejectOpen(true);
                      }}
                    >
                      <CircleX size={15} /> Reject resolution
                    </Button>
                  </div>
                </>
              ) : null}

              {ticket.rating !== null ? (
                <div className="approval-feedback">
                  <p className="eyebrow">Your feedback</p>
                  <h2 className="rating-title">You rated this {ticket.rating}/5</h2>
                  <div className="rating-done">
                    <Stars value={ticket.rating} size="md" />
                    <div>
                      <p>
                        {ticket.ratingComment
                          ? `“${ticket.ratingComment}”`
                          : "Thanks for helping the IT team improve."}
                      </p>
                      <p className="small muted">
                        Rated {ticket.ratedAt ? relativeTime(ticket.ratedAt) : "recently"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : ticket.permissions.canRate ? (
                <div className="approval-feedback">
                  <p className="eyebrow">Your feedback</p>
                  <h2 className="rating-title">How did we do?</h2>
                  <p className="rating-sub">
                    Rate the service from IT support. Your rating helps admins monitor quality.
                  </p>
                  <div className="rating-form">
                    <Stars
                      value={rating}
                      onChange={(next) => {
                        setRating(next);
                        setRatingError(null);
                      }}
                      size="lg"
                    />
                    {ratingError ? <p className="error-text">{ratingError}</p> : null}
                    <Field label="Anything to add? (optional)" htmlFor="rating-comment">
                      <textarea
                        id="rating-comment"
                        className="textarea"
                        style={{ minHeight: 76 }}
                        maxLength={1000}
                        value={ratingComment}
                        onChange={(event) => setRatingComment(event.target.value)}
                        placeholder="Was the fix clear? Was communication timely?"
                      />
                    </Field>
                    <div className="row">
                      <Button onClick={submitRating} loading={busy === "rating"}>
                        <Star size={15} /> Submit rating
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </Card>
          ) : null}

          {detail.error ? <ErrorNote message={detail.error} /> : null}
        </div>

        <aside className="detail-rail">
          <CallHistoryCard ticket={ticket} />

          {portal === "customer" ? (
            <Card>
              <CardHead
                title="Product concern"
                description="Keep this linked to the product your issue is about."
              />
              <div className="card-body" style={{ paddingTop: 10 }}>
                {ticket.permissions.canChangeProduct ? (
                  <>
                    <Select
                      value={ticket.product?.id ?? "none"}
                      onChange={(event) => changeProduct(event.target.value)}
                      disabled={busy !== null}
                      aria-label="Product this request is about"
                    >
                      <option value="none">Not sure / not listed</option>
                      {(detail.data?.products ?? []).map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </Select>
                    <p className="hint" style={{ marginTop: 8 }}>
                      Choose “Not sure / not listed” if you don't know. IT can update it later.
                    </p>
                  </>
                ) : (
                  <ProductPill product={ticket.product} />
                )}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHead title="Request details" />
            <div className="card-body" style={{ paddingTop: 8, paddingBottom: 10 }}>
              <dl className="detail-list">
                <div className="detail-row">
                  <dt>Status</dt>
                  <dd>
                    <StatusPill status={ticket.status} />
                  </dd>
                </div>
                <div className="detail-row">
                  <dt>Priority</dt>
                  <dd>
                    <PriorityPill priority={ticket.priority} />
                  </dd>
                </div>
                <div className="detail-row">
                  <dt>Product</dt>
                  <dd>
                    <ProductPill product={ticket.product} />
                  </dd>
                </div>
                <div className="detail-row">
                  <dt>Category</dt>
                  <dd>{ticket.category}</dd>
                </div>
                <div className="detail-row">
                  <dt>Agent</dt>
                  <dd>{ticket.assignee?.name ?? "Not assigned"}</dd>
                </div>
                <div className="detail-row">
                  <dt>Opened</dt>
                  <dd>{formatDateTime(ticket.createdAt)}</dd>
                </div>
                {ticket.resolvedAt ? (
                  <div className="detail-row">
                    <dt>Resolved</dt>
                    <dd>{formatDateTime(ticket.resolvedAt)}</dd>
                  </div>
                ) : null}
                {ticket.approvedAt ? (
                  <div className="detail-row">
                    <dt>Approved</dt>
                    <dd>{formatDateTime(ticket.approvedAt)}</dd>
                  </div>
                ) : null}
                {ticket.rejectedAt ? (
                  <div className="detail-row">
                    <dt>Rejected</dt>
                    <dd>{formatDateTime(ticket.rejectedAt)}</dd>
                  </div>
                ) : null}
                {ticket.reopenedCount > 0 ? (
                  <div className="detail-row">
                    <dt>Reopened</dt>
                    <dd>{ticket.reopenedCount}×</dd>
                  </div>
                ) : null}
                {ticket.rating !== null ? (
                  <div className="detail-row">
                    <dt>Rating</dt>
                    <dd>
                      <Stars value={ticket.rating} size="sm" />
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </Card>

          <Card>
            <CardHead
              title="Service targets"
              description="Set by priority; admins monitor these live."
            />
            <div className="card-body" style={{ paddingTop: 12, paddingBottom: 12 }}>
              <div className="sla-box">
                <div className="sla-row">
                  <span>First response</span>
                  <span className="sla-value">{formatDateTime(ticket.responseDueAt)}</span>
                </div>
                <div className="sla-row">
                  <span>Response status</span>
                  <span className={`sla-tag tone-${responseDue.tone}`}>
                    {responseDue.tone === "over" ? <TriangleAlert size={11} /> : <Clock3 size={11} />}
                    {responseDue.text}
                  </span>
                </div>
                <div className="divider" style={{ margin: "4px 0" }} />
                <div className="sla-row">
                  <span>Resolution target</span>
                  <span className="sla-value">{formatDateTime(ticket.resolveDueAt)}</span>
                </div>
                <div className="sla-row">
                  <span>Resolution status</span>
                  <span className={`sla-tag tone-${resolveDue.tone}`}>
                    {resolveDue.tone === "over" ? <TriangleAlert size={11} /> : <Timer size={11} />}
                    {resolveDue.text}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {isStaff ? (
            <>
              <Card>
                <CardHead title="Requester" />
                <div className="card-body" style={{ paddingTop: 14 }}>
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <Avatar name={ticket.customer.name} size="md" />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 620, fontSize: 13 }}>{ticket.customer.name}</p>
                      <p className="small muted">
                        {ticket.customer.company ?? "Customer"}
                        {ticket.customerContext
                          ? ` · ${ticket.customerContext.total} requests, ${ticket.customerContext.open} open`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <dl className="detail-list" style={{ marginTop: 10 }}>
                    <div className="detail-row">
                      <dt>Email</dt>
                      <dd className="mono" style={{ fontSize: 11 }}>
                        {ticket.customer.email}
                      </dd>
                    </div>
                    <div className="detail-row">
                      <dt>Channel</dt>
                      <dd>{ticket.channel === "assistant" ? "Support assistant" : "Customer portal"}</dd>
                    </div>
                  </dl>
                  {portal === "admin" ? (
                    <Link
                      to={`/admin/requests?q=${encodeURIComponent(ticket.customer.name)}`}
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: 6, paddingLeft: 0 }}
                    >
                      View all their requests →
                    </Link>
                  ) : null}
                </div>
              </Card>

              <Card>
                <CardHead title="Activity" description="Status, assignment, and resolution history." />
                <div className="card-body" style={{ paddingTop: 10, paddingBottom: 10 }}>
                  {ticket.activity.length ? (
                    <div className="timeline">
                      {[...ticket.activity].reverse().map((event) => (
                        <div className="tl-item" key={event.id}>
                          <span className={`tl-dot ${event.type === "reopened" ? "is-warn" : ""}`} />
                          <div>
                            <p className="tl-body">{event.label}</p>
                            <p className="tl-meta">
                              {event.actorName ? `${event.actorName} · ` : ""}
                              {relativeTime(event.createdAt)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="small muted">No activity recorded yet.</p>
                  )}
                </div>
              </Card>
            </>
          ) : (
            <div className="card">
              <div className="card-body">
                <p className="rail-note">
                  <Lock size={14} />
                  <span>
                    This conversation is private to you and the IT support team. Screenshots and replies stay
                    inside SupportIQ — nothing is sent over email or chat apps.
                  </span>
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>

      <Modal
        open={resolveTarget !== null}
        onClose={() => setResolveTarget(null)}
        title={resolveTarget === "closed" ? "Close this request" : "Resolve this request"}
        description={
          resolveTarget === "closed"
            ? "The customer will see this outcome. They can still reply if something comes back."
            : "Mark the issue fixed and tell the customer what resolved it."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setResolveTarget(null)} disabled={busy === "resolve"}>
              Cancel
            </Button>
            <Button onClick={confirmResolve} loading={busy === "resolve"}>
              <CircleCheck size={15} /> {resolveTarget === "closed" ? "Close request" : "Mark resolved"}
            </Button>
          </>
        }
      >
        <Field
          label="Resolution summary"
          hint="Shown to the customer on this request and kept in the admin record."
        >
          <textarea
            className="textarea"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="What was the cause, what did you change, and what should the customer expect now?"
            maxLength={2000}
            autoFocus
          />
        </Field>
        <div className="callout" style={{ marginTop: 12 }}>
          <MessageSquare size={15} />
          <div>
            The customer can rate the service once this request is resolved, and can reply to reopen it.
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmApprove}
        title="Approve this resolution?"
        body="Approving confirms IT fixed the issue and closes the request. You can still reopen it by replying if the problem returns."
        confirmLabel="Approve resolution"
        tone="primary"
        busy={approving}
        onConfirm={approveRequest}
        onCancel={() => setConfirmApprove(false)}
      />

      <Modal
        open={rejectOpen}
        onClose={() => {
          if (!rejecting) setRejectOpen(false);
        }}
        title="Reject this resolution"
        description="Tell IT support what still needs fixing. The request will reopen and return to their queue."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectOpen(false)} disabled={rejecting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={rejectResolution} loading={rejecting}>
              <CircleX size={15} /> Reject resolution
            </Button>
          </>
        }
      >
        <Field
          label="What still needs fixing?"
          hint="This is shared with IT support and kept in the request history."
        >
          <textarea
            className="textarea"
            style={{ minHeight: 96 }}
            maxLength={2000}
            value={rejectReason}
            onChange={(event) => {
              setRejectReason(event.target.value);
              setRejectError(null);
            }}
            placeholder="The issue is still happening when…"
            autoFocus
          />
        </Field>
        {rejectError ? (
          <p className="error-text" style={{ marginTop: 8 }}>
            {rejectError}
          </p>
        ) : null}
      </Modal>

      <Modal
        open={adminHelpOpen}
        onClose={() => {
          if (!requestingAdminHelp) setAdminHelpOpen(false);
        }}
        title="Request admin help"
        description="Bring an admin into this conversation. They'll be notified and can reply here as an Admin."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setAdminHelpOpen(false)}
              disabled={requestingAdminHelp}
            >
              Cancel
            </Button>
            <Button onClick={requestAdminHelp} loading={requestingAdminHelp}>
              <ShieldCheck size={15} /> Request help
            </Button>
          </>
        }
      >
        <Field
          label="What do you need help with?"
          hint="This is shared with admins and kept in the request's activity history."
        >
          <textarea
            className="textarea"
            style={{ minHeight: 96 }}
            maxLength={1000}
            value={adminHelpReason}
            onChange={(event) => {
              setAdminHelpReason(event.target.value);
              setAdminHelpError(null);
            }}
            placeholder="For example: the customer is asking about a policy exception and I need approval…"
            autoFocus
          />
        </Field>
        {adminHelpError ? (
          <p className="error-text" style={{ marginTop: 8 }}>
            {adminHelpError}
          </p>
        ) : null}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ Thread */

function Thread({
  ticket,
  cannedReplies,
  onSend,
  onDismissFlag,
  canModerate = false,
  dismissingId = null,
}: {
  ticket: TicketDetail;
  cannedReplies: CannedReply[];
  onSend: (body: string, internal: boolean, attachmentIds: number[]) => Promise<void>;
  onDismissFlag?: (messageId: number) => Promise<void>;
  canModerate?: boolean;
  dismissingId?: number | null;
}) {
  const { user } = useAuth();

  return (
    <>
      <div className="thread">
        {ticket.messages.length === 0 ? (
          <p className="small muted" style={{ padding: "20px 0", textAlign: "center" }}>
            No messages yet.
          </p>
        ) : (
          ticket.messages.map((message, index) => {
            const day = formatDay(message.createdAt);
            const previous = ticket.messages[index - 1];
            const showDay = !previous || formatDay(previous.createdAt) !== day;
            return (
              <Fragment key={message.id}>
                {showDay ? <div className="thread-day">{day}</div> : null}
                <MessageRow message={message} viewerId={user?.id} canModerate={canModerate} onDismissFlag={onDismissFlag} dismissing={dismissingId === message.id} />
              </Fragment>
            );
          })
        )}
      </div>
      <Composer
        ticket={ticket}
        cannedReplies={cannedReplies}
        canInternal={ticket.permissions.canSetInternal}
        onSend={onSend}
      />
    </>
  );
}

function FlagBanner({
  message,
  canModerate,
  onDismissFlag,
  dismissing,
}: {
  message: TicketMessage;
  canModerate?: boolean;
  onDismissFlag?: (messageId: number) => Promise<void>;
  dismissing?: boolean;
}) {
  if (!message.isFlagged) return null;
  const labels: string[] = [];
  if (message.flagDetails?.phoneNumbers?.length) labels.push("phone number");
  if (message.flagDetails?.emails?.length) labels.push("email address");
  if (message.flagDetails?.outsideChatLinks?.length) labels.push("outside chat link");
  const detail = labels.length ? labels.join(", ") : (message.flagReason ?? "off-platform contact attempt");
  return (
    <div className="msg-flag-banner" role="status">
      <span className="msg-flag-text">
        <Flag size={13} /> Flagged: possible {detail} shared.
      </span>
      {canModerate && onDismissFlag ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm msg-flag-dismiss"
          onClick={() => void onDismissFlag(message.id)}
          disabled={dismissing}
          aria-label="Dismiss flag"
        >
          <ShieldCheck size={13} /> {dismissing ? "Dismissing…" : "Dismiss"}
        </button>
      ) : null}
    </div>
  );
}

function MessageRow({
  message,
  viewerId,
  canModerate,
  onDismissFlag,
  dismissing,
}: {
  message: TicketMessage;
  viewerId?: number;
  canModerate?: boolean;
  onDismissFlag?: (messageId: number) => Promise<void>;
  dismissing?: boolean;
}) {
  if (message.senderRole === "system") {
    return (
      <details className="msg-system">
        <summary>
          <FileText size={13} />
          Assistant transcript captured with this request (internal)
          <ChevronDown size={12} />
        </summary>
        <pre>{message.body}</pre>
      </details>
    );
  }

  if (message.isInternal) {
    return (
      <div className={`msg-internal ${message.isFlagged ? "is-flagged" : ""}`.trim()}>
        <div className="msg-meta">
          <Lock size={12} /> Internal note
          <span>·</span>
          <span>{message.sender?.name ?? "Support team"}</span>
          {message.senderRole === "admin" ? (
            <span className="msg-role is-admin">
              <ShieldCheck size={11} /> Admin
            </span>
          ) : null}
          <span>·</span>
          <span>{formatTime(message.createdAt)}</span>
        </div>
        <div className="msg-bubble">{message.body}</div>
        <FlagBanner message={message} canModerate={canModerate} onDismissFlag={onDismissFlag} dismissing={dismissing} />
        <AttachmentList attachments={message.attachments} />
      </div>
    );
  }

  const isBot = message.senderRole === "bot";
  const isAdmin = message.senderRole === "admin";
  const isOwn = message.sender?.id === viewerId;
  const author = isBot ? "SupportIQ Assistant" : (message.sender?.name ?? "Support team");

  return (
    <div className={`msg ${isOwn ? "msg-own" : ""} ${isBot ? "msg-bot" : ""} ${isAdmin ? "msg-admin" : ""}`.trim()}>
      <div className="msg-avatar">
        {isBot ? (
          <span className="chat-avatar bot-avatar">
            <Sparkles size={14} />
          </span>
        ) : (
          <Avatar name={author} size="sm" />
        )}
      </div>
      <div className="msg-body">
        <div className="msg-meta">
          <span className="msg-author">{author}</span>
          {isAdmin ? (
            <span className="msg-role is-admin">
              <ShieldCheck size={11} /> Admin
            </span>
          ) : ROLE_TAG[message.senderRole] ? (
            <span className="msg-role">{ROLE_TAG[message.senderRole]}</span>
          ) : null}
          <span>·</span>
          <span>{formatTime(message.createdAt)}</span>
        </div>
        <div className={`msg-bubble ${message.isFlagged ? "is-flagged" : ""}`.trim()}>{message.body}</div>
        <FlagBanner message={message} canModerate={canModerate} onDismissFlag={onDismissFlag} dismissing={dismissing} />
        <AttachmentList attachments={message.attachments} />
      </div>
    </div>
  );
}

function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  if (!attachments.length) return null;
  return (
    <div className="msg-attachments">
      {attachments.map((attachment) =>
        isImage(attachment.mime) ? (
          <a
            key={attachment.id}
            className="att-image"
            href={attachment.url}
            target="_blank"
            rel="noreferrer"
            title={attachment.filename}
          >
            <img src={attachment.url} alt={attachment.filename} loading="lazy" />
          </a>
        ) : (
          <a
            key={attachment.id}
            className="att-file"
            href={attachment.url}
            target="_blank"
            rel="noreferrer"
            title={attachment.filename}
          >
            <FileText size={14} />
            <span>{attachment.filename}</span>
            <span className="muted">{fileSize(attachment.size)}</span>
          </a>
        ),
      )}
    </div>
  );
}

/* -------------------------------------------------------------- Call action */

function CallActions({ ticket }: { ticket: TicketDetail }) {
  const { user } = useAuth();
  const { phase, call, startCall, callVersion } = useCall();
  const [starting, setStarting] = useState<CallKind | null>(null);
  const [presence, setPresence] = useState<{ online: boolean } | null>(null);
  const isCustomer = user?.role === "customer";
  const canCall = isCustomer ? Boolean(ticket.assignee) : true;
  const peerName = isCustomer ? ticket.assignee?.name : ticket.customer.name;
  const busy = phase !== "idle";
  const onThisTicket = call?.ticketId === ticket.id && busy;

  useEffect(() => {
    let active = true;
    const load = () => {
      api
        .get<{ online: boolean }>(`/api/calls/availability/${ticket.id}`)
        .then((data) => {
          if (active) setPresence(data);
        })
        .catch(() => {
          if (active) setPresence(null);
        });
    };
    load();
    const timer = window.setInterval(load, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [ticket.id, callVersion]);

  const start = async (kind: CallKind) => {
    setStarting(kind);
    try {
      await startCall(ticket.id, kind);
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="ticket-call-actions">
      <Button
        size="sm"
        variant="soft"
        disabled={!canCall || busy}
        loading={starting === "video"}
        onClick={() => void start("video")}
      >
        <Video size={14} /> Video call
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={!canCall || busy}
        loading={starting === "audio"}
        onClick={() => void start("audio")}
      >
        <Phone size={14} /> Voice call
      </Button>
      {onThisTicket ? (
        <span className="call-live-pill">
          <span className="call-live-dot" />
          {phase === "active" ? "Call in progress" : phase === "incoming" ? "Incoming call" : "Ringing…"}
        </span>
      ) : !canCall ? (
        <span className="ticket-call-hint">Available once an IT agent is assigned.</span>
      ) : peerName ? (
        <span className="ticket-call-hint">
          Calls {peerName}
          {presence ? (
            <>
              {" · "}
              <span className={`call-presence ${presence.online ? "is-online" : "is-offline"}`}>
                <span className="call-presence-dot" />
                {presence.online ? "online" : "offline"}
              </span>
            </>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- Call history */

function formatCallDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

function callOutcome(record: CallRecord, outgoing: boolean): string {
  switch (record.status) {
    case "ringing":
      return "Ringing…";
    case "active":
      return "In progress";
    case "ended":
      return record.durationSeconds != null ? formatCallDuration(record.durationSeconds) : "Completed";
    case "declined":
      return "Declined";
    case "missed":
      return outgoing ? "No answer" : "Missed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Ended";
  }
}

function CallHistoryCard({ ticket }: { ticket: TicketDetail }) {
  const { user } = useAuth();
  const { callVersion } = useCall();
  const history = useApi<{ calls: CallRecord[] }>(
    () => api.get<{ calls: CallRecord[] }>(`/api/calls/ticket/${ticket.id}`),
    [ticket.id, callVersion],
  );
  const calls = (history.data?.calls ?? []).slice(0, 5);

  return (
    <Card>
      <CardHead title="Calls" description="Voice and video calls about this request." />
      <div className="card-body" style={{ paddingTop: 10, paddingBottom: 10 }}>
        {history.loading && !history.data ? (
          <p className="small muted">Loading call history…</p>
        ) : history.error ? (
          <p className="small muted">{history.error}</p>
        ) : calls.length === 0 ? (
          <p className="small muted">No calls yet. Start one with the buttons above.</p>
        ) : (
          <ul className="call-history">
            {calls.map((record) => {
              const outgoing = record.caller.id === user?.id;
              const missed = ["missed", "declined", "cancelled"].includes(record.status);
              const Icon = missed ? PhoneMissed : outgoing ? PhoneOutgoing : PhoneIncoming;
              return (
                <li className={`call-history-item is-${record.status}`} key={record.id}>
                  <span className="call-history-icon">
                    <Icon size={14} />
                  </span>
                  <div className="call-history-main">
                    <span className="call-history-name">
                      {outgoing ? `Call to ${record.callee.name}` : `Call from ${record.caller.name}`}
                    </span>
                    <span className="call-history-meta">
                      {record.kind === "video" ? <Video size={11} /> : <Phone size={11} />}
                      {record.kind === "video" ? "Video" : "Voice"} · {relativeTime(record.createdAt)}
                    </span>
                  </div>
                  <span className="call-history-status">{callOutcome(record, outgoing)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- Composer */

function Composer({
  ticket,
  cannedReplies,
  canInternal,
  onSend,
}: {
  ticket: TicketDetail;
  cannedReplies: CannedReply[];
  canInternal: boolean;
  onSend: (body: string, internal: boolean, attachmentIds: number[]) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const submit = async () => {
    const text = body.trim();
    if (!text && attachments.length === 0) {
      setError("Write a message or add an attachment.");
      return;
    }
    if (internal && !text) {
      setError("Internal notes need some text.");
      return;
    }
    setError(null);
    setSending(true);
    try {
      await onSend(text, internal, attachments.map((attachment) => attachment.id));
      setBody("");
      setAttachments([]);
      setInternal(false);
    } catch (sendError) {
      setError(errorMessage(sendError));
    } finally {
      setSending(false);
    }
  };

  const upload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const attachment = await uploadAttachmentFile(file);
      setAttachments((current) => [...current, attachment]);
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const useCanned = (reply: CannedReply) => {
    setBody((current) => (current.trim() ? `${current.trim()}\n\n${reply.body}` : reply.body));
    if (detailsRef.current) detailsRef.current.open = false;
  };

  const placeholder = internal
    ? "Internal note — only the support team can see this…"
    : isAdmin
      ? "Reply as Admin — your message will show the Admin badge…"
      : canInternal
        ? "Reply to the customer…"
        : "Write a reply to IT support…";

  return (
    <div className="composer">
      {attachments.length ? (
        <div className="attachment-row" style={{ marginBottom: 8 }}>
          {attachments.map((attachment) => (
            <span className="attach-chip" key={attachment.id}>
              <Paperclip size={12} />
              <span>{attachment.filename}</span>
              <button
                type="button"
                aria-label={`Remove ${attachment.filename}`}
                onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {error ? <ErrorNote message={error} /> : null}

      {isAdmin ? (
        <div className="composer-admin-note">
          <ShieldCheck size={13} /> Replying as Admin — your message is marked as an admin intervention.
        </div>
      ) : null}

      <div className="composer-box" style={{ marginTop: error ? 8 : 0 }}>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={placeholder}
          maxLength={6000}
          minLength={0}
          aria-label={internal ? "Internal note" : "Reply"}
        />
        <div className="composer-row">
          <label className="icon-btn" title="Attach a screenshot or PDF">
            <Paperclip size={16} />
            <input
              ref={fileRef}
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
              onChange={(event) => void upload(event.target.files)}
            />
          </label>
          {uploading ? <span className="small muted">Uploading…</span> : null}

          {canInternal && cannedReplies.length ? (
            <details className="canned-menu" ref={detailsRef}>
              <summary className="btn btn-secondary btn-sm">Saved replies</summary>
              <div className="canned-pop">
                {cannedReplies.map((reply) => (
                  <button
                    key={reply.id}
                    type="button"
                    className="canned-item"
                    onClick={() => useCanned(reply)}
                  >
                    <strong>{reply.title}</strong>
                    <span>{reply.body}</span>
                  </button>
                ))}
              </div>
            </details>
          ) : null}

          {canInternal ? (
            <button
              type="button"
              className={`internal-toggle ${internal ? "is-on" : ""}`.trim()}
              onClick={() => setInternal((current) => !current)}
              aria-pressed={internal}
              title="Internal notes are hidden from the customer"
            >
              <Lock size={12} /> Internal note
            </button>
          ) : null}

          <span className="spacer" />
          <span className="composer-note">
            {ticket.status === "closed" && !canInternal ? (
              <>
                <Clock3 size={11} /> Replying reopens this request
              </>
            ) : (
              <>Ctrl+Enter to send</>
            )}
          </span>
          <Button size="sm" onClick={submit} loading={sending} disabled={uploading}>
            <Send size={14} /> {internal ? "Add note" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
