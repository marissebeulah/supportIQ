import { CircleCheck, CircleX, Flag, ShieldCheck, Star, TriangleAlert } from "lucide-react";
import { dueStatus, relativeTime } from "../lib/format";
import type { TicketSummary } from "../lib/types";
import { PriorityPill, ProductPill, StatusPill } from "./ui";
import type { ReactNode } from "react";

export function StaffTicketTable({
  tickets,
  onOpen,
  showRating = false,
  empty,
}: {
  tickets: TicketSummary[];
  onOpen: (ticket: TicketSummary) => void;
  showRating?: boolean;
  empty: ReactNode;
}) {
  if (!tickets.length) return <>{empty}</>;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Request</th>
            <th>Customer</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Service target</th>
            {showRating ? <th>Rating</th> : null}
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => {
            const target = ticket.firstResponseAt ? ticket.resolveDueAt : ticket.responseDueAt;
            const completed =
              ticket.status === "resolved" || ticket.status === "closed"
                ? (ticket.resolvedAt ?? ticket.closedAt)
                : ticket.firstResponseAt
                  ? null
                  : null;
            const sla = dueStatus(target, completed);
            return (
              <tr
                key={ticket.id}
                className="clickable"
                onClick={() => onOpen(ticket)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(ticket);
                  }
                }}
              >
                <td style={{ maxWidth: 340 }}>
                  <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <span className="row-ref">{ticket.ref}</span>
                    {ticket.isFlagged ? (
                      <span className="badge badge-flagged" title="Contains a flagged message">
                        <Flag size={11} /> Flagged
                      </span>
                    ) : null}
                    {ticket.rejectedAt ? (
                      <span
                        className="badge badge-rejected"
                        title={ticket.rejectionReason ?? "The customer rejected the resolution"}
                      >
                        <CircleX size={11} /> Rejected
                      </span>
                    ) : null}
                    {ticket.approvedAt ? (
                      <span className="badge badge-approved" title="The customer approved the resolution">
                        <CircleCheck size={11} /> Approved
                      </span>
                    ) : null}
                    {ticket.adminHelpRequestedAt ? (
                      <span
                        className="badge badge-admin-help"
                        title={ticket.adminHelpReason ?? "IT support requested admin help"}
                      >
                        <ShieldCheck size={11} /> Admin help
                      </span>
                    ) : null}
                    {ticket.unreadCount > 0 ? <span className="unread-pill">{ticket.unreadCount}</span> : null}
                  </div>
                  <div className="cell-title" style={{ marginTop: 2 }}>
                    {ticket.subject}
                  </div>
                  <div className="cell-sub product-cell">
                    <span>{ticket.category}</span>
                    <ProductPill product={ticket.product} />
                  </div>
                </td>
                <td>
                  <div className="cell-title" style={{ fontWeight: 550 }}>
                    {ticket.customer.name}
                  </div>
                  <div className="cell-sub">{ticket.customer.company ?? "—"}</div>
                </td>
                <td>
                  <PriorityPill priority={ticket.priority} />
                </td>
                <td>
                  <StatusPill status={ticket.status} />
                </td>
                <td>
                  {ticket.assignee ? (
                    <span style={{ fontWeight: 550 }}>{ticket.assignee.name}</span>
                  ) : (
                    <span className="muted">Unassigned</span>
                  )}
                </td>
                <td className="cell-nowrap">
                  <span className={`sla-tag tone-${sla.tone}`}>
                    {sla.tone === "over" ? <TriangleAlert size={11} /> : null}
                    {sla.text}
                  </span>
                </td>
                {showRating ? (
                  <td>
                    {ticket.rating ? (
                      <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                        <Star size={12} className="is-on" fill="currentColor" style={{ color: "var(--gold)" }} />
                        <span style={{ fontWeight: 600 }}>{ticket.rating}</span>
                        <span className="muted small">/5</span>
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                ) : null}
                <td className="cell-nowrap muted">{relativeTime(ticket.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
