import { ChevronRight, CircleX } from "lucide-react";
import { relativeTime } from "../lib/format";
import type { TicketSummary } from "../lib/types";
import { PriorityPill, ProductPill, StatusPill } from "./ui";

function preview(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 88 ? `${clean.slice(0, 88)}…` : clean;
}

export function CustomerTicketRow({
  ticket,
  onOpen,
}: {
  ticket: TicketSummary;
  onOpen: (ticket: TicketSummary) => void;
}) {
  return (
    <button type="button" className="ticket-row" onClick={() => onOpen(ticket)}>
      <div style={{ minWidth: 0 }}>
        <div className="ticket-row-top">
          <span className="row-ref">{ticket.ref}</span>
          <StatusPill status={ticket.status} />
          <PriorityPill priority={ticket.priority} />
          <ProductPill product={ticket.product} />
          {ticket.rejectedAt ? (
            <span
              className="badge badge-rejected"
              title={ticket.rejectionReason ?? "You rejected the resolution"}
            >
              <CircleX size={11} /> Rejected
            </span>
          ) : null}
          {ticket.isLate ? <span className="badge badge-late">Late</span> : null}
        </div>
        <div className="ticket-row-title">{ticket.subject}</div>
        <div className="ticket-row-meta">
          <span>{ticket.assignee ? `Handled by ${ticket.assignee.name}` : "Awaiting assignment"}</span>
          <span className="dot-sep">Updated {relativeTime(ticket.updatedAt)}</span>
          {ticket.lastMessage ? (
            <span className="dot-sep preview">
              {ticket.lastMessage.senderRole === "customer" ? "You: " : ""}
              {preview(ticket.lastMessage.body)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="ticket-row-side">
        {ticket.unreadCount > 0 ? (
          <span className="unread-pill" title={`${ticket.unreadCount} unread`}>
            {ticket.unreadCount}
          </span>
        ) : null}
        <span className="ticket-row-time">
          {relativeTime(ticket.updatedAt)} <ChevronRight size={12} style={{ verticalAlign: "-2px" }} />
        </span>
      </div>
    </button>
  );
}
