import { CircleX, ShieldCheck } from "lucide-react";
import { dueStatus, relativeTime } from "../lib/format";
import type { TicketSummary } from "../lib/types";
import { PriorityPill } from "./ui";

export function LateTicketRow({
  ticket,
  onOpen,
  showAssignee = false,
}: {
  ticket: TicketSummary;
  onOpen: () => void;
  showAssignee?: boolean;
}) {
  const due = dueStatus(ticket.firstResponseAt ? ticket.resolveDueAt : ticket.responseDueAt);
  return (
    <button type="button" className="ticket-row" onClick={onOpen}>
      <div style={{ minWidth: 0 }}>
        <div className="ticket-row-top">
          <span className="row-ref">{ticket.ref}</span>
          <PriorityPill priority={ticket.priority} />
          {ticket.rejectedAt ? (
            <span className="badge badge-rejected" title={ticket.rejectionReason ?? "The customer rejected the resolution"}>
              <CircleX size={11} /> Rejected
            </span>
          ) : null}
          {ticket.adminHelpRequestedAt ? (
            <span className="badge badge-admin-help" title={ticket.adminHelpReason ?? "IT support requested admin help"}>
              <ShieldCheck size={11} /> Admin help
            </span>
          ) : null}
          <span className="badge badge-late">
            {ticket.lateReason === "first_response" ? "No first response" : "Resolution overdue"}
          </span>
        </div>
        <div className="ticket-row-title">{ticket.subject}</div>
        <div className="ticket-row-meta">
          <span>{ticket.customer.name}</span>
          {showAssignee ? <span className="dot-sep">{ticket.assignee?.name ?? "Unassigned"}</span> : null}
          <span className="dot-sep">{relativeTime(ticket.updatedAt)}</span>
        </div>
      </div>
      <div className="ticket-row-side">
        <span className={`sla-tag tone-${due.tone}`}>{due.text}</span>
      </div>
    </button>
  );
}
