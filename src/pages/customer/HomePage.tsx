import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, Lock, MessageSquare, Plus, Sparkles, Star, Ticket } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { api } from "../../lib/api";
import { useApi, useRealtime, useTitle } from "../../lib/hooks";
import { firstName, greeting, relativeTime } from "../../lib/format";
import type { TicketListResponse, TicketSummary } from "../../lib/types";
import { AnimatedNumber, Button, Card, CardHead, EmptyState, PageHead, SkeletonRows, Stars } from "../../components/ui";
import { CustomerTicketRow } from "../../components/CustomerTicketRow";

export default function CustomerHomePage() {
  useTitle("Overview");
  const { user } = useAuth();
  const navigate = useNavigate();
  const ticketsQuery = useApi<TicketListResponse>(() => api.get<TicketListResponse>("/api/tickets?limit=100"));
  useRealtime(() => ticketsQuery.reload());

  const all = ticketsQuery.data?.tickets ?? [];
  const active = all.filter((ticket) => ticket.status !== "resolved" && ticket.status !== "closed");
  const waiting = all.filter((ticket) => ticket.status === "waiting_customer");
  const resolved = all.filter((ticket) => ticket.status === "resolved" || ticket.status === "closed");
  const unread = active.reduce((total, ticket) => total + ticket.unreadCount, 0);
  const needsRating = resolved.filter((ticket) => ticket.rating === null);
  const latestResolved = resolved[0];

  const openTicket = (ticket: TicketSummary) => navigate(`/portal/requests/${ticket.id}`);

  return (
    <>
      <PageHead
        eyebrow="Customer portal"
        title={`${greeting()}, ${firstName(user?.name ?? "there")}`}
        description="Ask for help, follow every update from IT, and rate the service when your request is done."
        actions={
          <>
            <Link to="/portal/assistant" className="btn btn-secondary btn-md">
              <Sparkles size={15} />
              Ask the assistant
            </Link>
            <Link to="/portal/requests/new" className="btn btn-primary btn-md">
              <Plus size={15} />
              New request
            </Link>
          </>
        }
      />

      <div className="stat-grid">
        <div className="stat is-accent">
          <span className="stat-icon">
            <Ticket size={17} />
          </span>
          <p className="stat-label">Active requests</p>
          <p className="stat-value"><AnimatedNumber value={active.length} /></p>
          <p className="stat-sub">{all.length} opened in total</p>
        </div>
        <div className="stat">
          <span className="stat-icon">
            <MessageSquare size={17} />
          </span>
          <p className="stat-label">Replies for you</p>
          <p className="stat-value"><AnimatedNumber value={unread} /></p>
          <p className="stat-sub">{unread === 1 ? "1 unread message" : `${unread} unread messages`}</p>
        </div>
        <div className="stat">
          <span className="stat-icon">
            <Star size={17} />
          </span>
          <p className="stat-label">Waiting on you</p>
          <p className="stat-value"><AnimatedNumber value={waiting.length} /></p>
          <p className="stat-sub">{waiting.length ? "IT needs a reply to continue" : "Nothing needed right now"}</p>
        </div>
        <div className="stat is-accent">
          <span className="stat-icon">
            <Sparkles size={17} />
          </span>
          <p className="stat-label">Resolved</p>
          <p className="stat-value"><AnimatedNumber value={resolved.length} /></p>
          <p className="stat-sub">{needsRating.length ? `${needsRating.length} awaiting your rating` : "All rated — thank you"}</p>
        </div>
      </div>

      <div className="cols cols-2-1">
        <Card>
          <CardHead
            title="Active requests"
            description={active.length ? "Live status and the latest message from IT." : "Everything you've asked for help with."}
            action={
              <Link to="/portal/requests" className="btn btn-ghost btn-sm">
                View all <ArrowUpRight size={14} />
              </Link>
            }
          />
          {ticketsQuery.loading && !ticketsQuery.data ? (
            <SkeletonRows rows={4} />
          ) : active.length ? (
            <div className="ticket-rows">
              {active.slice(0, 5).map((ticket) => (
                <CustomerTicketRow key={ticket.id} ticket={ticket} onOpen={openTicket} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={MessageSquare}
              title="No active requests"
              body="When something isn't working, open a request and IT support will pick it up. Your conversation stays here."
              action={
                <Link to="/portal/requests/new" className="btn btn-primary btn-sm">
                  <Plus size={14} /> Create a request
                </Link>
              }
            />
          )}
        </Card>

        <div className="stack">
          <section className="card assistant-cta">
            <span className="assistant-cta-icon">
              <Sparkles size={18} />
            </span>
            <p className="eyebrow">Support assistant</p>
            <h2 className="assistant-cta-title">Not sure where to start?</h2>
            <p className="assistant-cta-text">
              Get an instant answer on sign-in, errors, invoices, exports, and request status — or hand the
              conversation to IT without repeating yourself.
            </p>
            <Link to="/portal/assistant" className="btn btn-soft btn-md">
              Open assistant
            </Link>
            <p className="assistant-cta-note">
              <Lock size={11} /> Support only — it never sends sales or promotional messages.
            </p>
          </section>

          {needsRating.length && latestResolved ? (
            <Card>
              <div className="card-body">
                <p className="eyebrow">Your feedback</p>
                <h2 className="rating-title">How did we do?</h2>
                {latestResolved.rating ? (
                  <Stars value={latestResolved.rating} size="sm" />
                ) : (
                  <p className="rating-sub">
                    {latestResolved.ref} is resolved. Rating takes a moment and helps the team improve.
                  </p>
                )}
                <div className="row" style={{ marginTop: 12 }}>
                  <Link to={`/portal/requests/${latestResolved.id}`} className="btn btn-secondary btn-sm">
                    <Star size={14} /> Rate the service
                  </Link>
                  {latestResolved.firstResponseAt ? (
                    <span className="small muted">Updated {relativeTime(latestResolved.updatedAt)}</span>
                  ) : null}
                </div>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHead title="How SupportIQ works" />
            <div className="card-body">
              <ol className="steps">
                <li>
                  <span className="step-num">1</span>
                  <div>
                    <strong>Ask for help</strong>
                    <p>Chat with the assistant or create a request and attach a screenshot.</p>
                  </div>
                </li>
                <li>
                  <span className="step-num">2</span>
                  <div>
                    <strong>IT takes ownership</strong>
                    <p>An agent is assigned, replies in this thread, and updates the status as they work.</p>
                  </div>
                </li>
                <li>
                  <span className="step-num">3</span>
                  <div>
                    <strong>Confirm and rate</strong>
                    <p>Once resolved, tell us how it went. Admins monitor every request for timeliness.</p>
                  </div>
                </li>
              </ol>
            </div>
          </Card>
        </div>
      </div>

      {resolved.length ? (
        <div style={{ marginTop: 14 }}>
          <Card>
            <CardHead
              title="Recently resolved"
              description="Requests the IT team has closed the loop on."
              action={
                <Button variant="ghost" size="sm" onClick={() => navigate("/portal/requests?filter=resolved")}>
                  See history <ArrowUpRight size={14} />
                </Button>
              }
            />
            <div className="ticket-rows">
              {resolved.slice(0, 3).map((ticket) => (
                <CustomerTicketRow key={ticket.id} ticket={ticket} onOpen={openTicket} />
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
