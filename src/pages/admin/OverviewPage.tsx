import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, FileText, Inbox, RefreshCw, ShieldCheck, Star, Ticket, Timer, TriangleAlert, Users } from "lucide-react";
import { api } from "../../lib/api";
import { useApi, useRealtime, useTitle } from "../../lib/hooks";
import {
  STATUS_META,
  STATUS_ORDER,
  formatMinutes,
  formatNumber,
  percent,
  relativeTime,
} from "../../lib/format";
import type { AdminOverview } from "../../lib/types";
import { AnimatedNumber, Button, Card, CardHead, EmptyState, PageHead, PaginatedList, ProductConcerns, SkeletonRows, SkeletonStats, Stars } from "../../components/ui";
import { VolumeChart } from "../../components/VolumeChart";
import { LateTicketRow } from "../../components/LateTicketRow";
import { useToast } from "../../components/toast";

const STATUS_COLORS: Record<string, string> = {
  open: "#1f4bc4",
  in_progress: "#c2801a",
  waiting_customer: "#8151cc",
  resolved: "#0f5d4c",
  closed: "#8d93a1",
};

export default function AdminOverviewPage() {
  useTitle("Operations overview");
  const navigate = useNavigate();
  const { toast } = useToast();

  const overview = useApi<AdminOverview>(() => api.get<AdminOverview>("/api/admin/overview"));
  useRealtime(() => overview.reload());

  const data = overview.data;
  const stats = data?.stats;
  const totalTickets = stats?.totalTickets ?? 0;
  const statusTotal = STATUS_ORDER.reduce((total, status) => total + (data?.statusBreakdown[status] ?? 0), 0);
  const positivePct = stats && stats.csatCount ? percent(stats.csatPositive, stats.csatCount) : 0;
  const maxCategoryCount = Math.max(1, ...(data?.categories.map((item) => item.count) ?? []));
  const maxAgentOpen = Math.max(1, ...(data?.agents.map((agent) => agent.openAssigned) ?? []));
  const assistantResolved = Math.max(0, (stats?.botConversations ?? 0) - (stats?.botEscalated ?? 0));
  const assistantTotal = stats?.botConversations ?? 0;
  const assistantResolvedPct = assistantTotal ? percent(assistantResolved, assistantTotal) : 0;
  const assistantEscalatedPct = assistantTotal ? percent(stats?.botEscalated ?? 0, assistantTotal) : 0;

  const refresh = () => {
    overview.reload();
    toast("Monitoring data refreshed.", "info");
  };

  return (
    <>
      <PageHead
        eyebrow="Support team"
        title="Support dashboard"
        description="See what needs attention, how quickly the team is replying, and what customers think."
        actions={
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span
              className="badge"
              style={{
                background: "rgba(23, 107, 135, 0.12)",
                color: "var(--primary)",
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: "var(--radius)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <ShieldCheck size={14} /> Permission: All (Admin)
            </span>
            <Link to="/admin/reports" className="btn btn-secondary btn-md">
              <FileText size={15} /> Reports
            </Link>
            <Button variant="secondary" onClick={refresh} loading={overview.loading}>
              <RefreshCw size={15} /> Refresh
            </Button>
          </div>
        }
      />

      {overview.loading && !data ? (
        <>
          <SkeletonStats count={6} />
          <Card>
            <SkeletonRows rows={4} />
          </Card>
        </>
      ) : !data || !stats ? (
        <Card>
          <EmptyState
            icon={TriangleAlert}
            title="Monitoring data unavailable"
            body={overview.error ?? "Could not load the overview. Try refreshing."}
          />
        </Card>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat is-accent">
              <span className="stat-icon">
                <Inbox size={17} />
              </span>
              <p className="stat-label">Requests to handle</p>
              <p className="stat-value"><AnimatedNumber value={stats.openTickets} /></p>
              <p className="stat-sub">of {formatNumber(totalTickets)} all time</p>
            </div>
            <div className={`stat ${stats.unassigned ? "is-warn" : ""}`}>
              <span className="stat-icon">
                <Users size={17} />
              </span>
              <p className="stat-label">Without an owner</p>
              <p className="stat-value"><AnimatedNumber value={stats.unassigned} /></p>
              <p className="stat-sub">{stats.unassigned ? "Choose someone to take these" : "Every request has an owner"}</p>
            </div>
            <div className={`stat ${stats.lateTickets ? "is-danger" : ""}`}>
              <span className="stat-icon">
                <TriangleAlert size={17} />
              </span>
              <p className="stat-label">Past due or at risk</p>
              <p className="stat-value"><AnimatedNumber value={stats.lateTickets} /></p>
              <p className="stat-sub">May need a quick follow-up</p>
            </div>
            <div className="stat">
              <span className="stat-icon">
                <Timer size={17} />
              </span>
              <p className="stat-label">Time to first reply</p>
              <p className="stat-value">{formatMinutes(stats.avgFirstResponseMinutes)}</p>
              <p className="stat-sub">{formatNumber(stats.firstResponseSample)} responded · 30 days</p>
            </div>
            <div className="stat is-accent">
              <span className="stat-icon">
                <Star size={17} />
              </span>
              <p className="stat-label">Customer rating</p>
              <p className="stat-value">
                {stats.csatAvg === null ? "—" : stats.csatAvg.toFixed(1)}
                <span className="unit">/ 5</span>
              </p>
              <p className="stat-sub">
                {formatNumber(stats.csatCount)} ratings · {positivePct}% positive
              </p>
            </div>
            <div className="stat">
              <span className="stat-icon">
                <ShieldCheck size={17} />
              </span>
              <p className="stat-label">Replies within target</p>
              <p className="stat-value">
                {stats.responseSlaPct === null ? "—" : stats.responseSlaPct}
                <span className="unit">%</span>
              </p>
              <p className="stat-sub">on {formatNumber(stats.responseSlaTotal)} responded requests</p>
            </div>
          </div>

          <div className="cols cols-2-1">
            <Card>
              <CardHead
                title="Request volume"
                description="New requests compared with completed requests over the last 14 days."
                action={
                  <Link to="/admin/requests" className="btn btn-ghost btn-sm">
                    All requests <ArrowUpRight size={14} />
                  </Link>
                }
              />
              <div className="chart-wrap">
                <VolumeChart data={data.volume} />
              </div>
              <div className="chart-legend">
                <span>
                  <i className="legend-dot created" /> Created
                </span>
                <span>
                  <i className="legend-dot resolved" /> Resolved
                </span>
                <span style={{ marginLeft: "auto" }}>UTC days</span>
              </div>
            </Card>

            <Card>
              <CardHead title="Request progress" description={`Where ${formatNumber(statusTotal)} requests are right now.`} />
              <div className="card-body">
                {statusTotal === 0 ? (
                  <p className="small muted">No requests yet.</p>
                ) : (
                  <div className="meter-list">
                    {STATUS_ORDER.map((status) => {
                      const count = data.statusBreakdown[status] ?? 0;
                      const share = percent(count, statusTotal);
                      return (
                        <div key={status}>
                          <div className="meter-top">
                            <span>{STATUS_META[status].label}</span>
                            <b>
                              {count} <span className="muted">· {share}%</span>
                            </b>
                          </div>
                          <div className="meter-track">
                            <div
                              className="meter-fill"
                              style={{ width: `${share}%`, background: STATUS_COLORS[status] }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="overview-chart-grid">
            <Card>
              <CardHead title="Common request topics" description="Topics customers asked about in the last 30 days." />
              <div className="card-body">
                {data.categories.length ? (
                  <div className="overview-bars" aria-label="Requests by topic">
                    {data.categories.map((item, index) => {
                      const colors = ["#0f5d4c", "#1f4bc4", "#c2801a", "#8151cc", "#a8331f"];
                      const share = percent(item.count, data.categories.reduce((total, category) => total + category.count, 0));
                      return (
                        <div className="overview-bar-item" key={item.category}>
                          <div className="overview-bar-meta">
                            <span>{item.category}</span>
                            <b>{item.count}</b>
                          </div>
                          <div className="overview-bar-track" aria-hidden="true">
                            <div
                              className="overview-bar-fill"
                              style={{ width: `${(item.count / maxCategoryCount) * 100}%`, background: colors[index % colors.length] }}
                            />
                          </div>
                          <span className="overview-bar-share">{share}% of requests</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="small muted">No requests in this period yet.</p>
                )}
              </div>
            </Card>

            <Card>
              <CardHead title="Team workload" description="Open requests assigned to each team member." />
              <div className="card-body">
                {data.agents.length ? (
                  <div className="overview-bars" aria-label="Open requests by team member">
                    {data.agents.map((agent) => (
                      <Link
                        className="overview-bar-item overview-bar-link"
                        key={agent.id}
                        to={`/admin/requests?assignee=${agent.id}`}
                      >
                        <div className="overview-bar-meta">
                          <span>{agent.name}</span>
                          <b>{agent.openAssigned} open</b>
                        </div>
                        <div className="overview-bar-track" aria-hidden="true">
                          <div
                            className="overview-bar-fill"
                            style={{ width: `${(agent.openAssigned / maxAgentOpen) * 100}%`, background: "var(--accent)" }}
                          />
                        </div>
                        <span className="overview-bar-share">{agent.resolved30d} completed in 30 days</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="small muted">No team members to show.</p>
                )}
              </div>
            </Card>
          </div>

          <Card style={{ marginTop: 14 }}>
            <CardHead
              title="Concerns by product"
              description="Every request grouped by the product it concerns. Select a product to review its queue."
              action={
                <Link to="/admin/automation" className="btn btn-ghost btn-sm">
                  Manage products <ArrowUpRight size={14} />
                </Link>
              }
            />
            <div className="card-body">
              <ProductConcerns
                items={data.products}
                onSelect={(id) =>
                  navigate(id === null ? "/admin/requests?productId=none" : `/admin/requests?productId=${id}`)
                }
                emptyLabel="Product concerns will appear here as requests are created."
              />
            </div>
          </Card>

          <div className="cols cols-2-1" style={{ marginTop: 14 }}>
            <Card>
              <CardHead
                title="Late & at risk"
                description="Requests that may need a reply or resolution soon."
                action={
                  <Link to="/admin/requests?late=1" className="btn btn-ghost btn-sm">
                    View all <ArrowUpRight size={14} />
                  </Link>
                }
              />
              {data.lateTickets.length ? (
                <div className="ticket-rows">
                  {data.lateTickets.map((ticket) => (
                    <LateTicketRow
                      key={ticket.id}
                      ticket={ticket}
                      showAssignee
                      onOpen={() => navigate(`/admin/requests/${ticket.id}`)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={ShieldCheck}
                  title="Everything is on target"
                  body="No request is currently breaching its service target."
                />
              )}
            </Card>

            <Card>
              <CardHead title="Customer feedback" description="How customers rated their support experience." />
              <div className="card-body">
                <div className="row" style={{ alignItems: "flex-end", gap: 10 }}>
                  <span style={{ fontFamily: "var(--serif)", fontSize: 38, lineHeight: 1 }}>
                    {stats.csatAvg === null ? "—" : stats.csatAvg.toFixed(1)}
                  </span>
                  <div style={{ paddingBottom: 3 }}>
                    <Stars value={Math.round(stats.csatAvg ?? 0)} size="sm" />
                    <p className="small muted" style={{ marginTop: 3 }}>
                      {stats.csatCount} ratings · {positivePct}% positive
                    </p>
                  </div>
                </div>
                <div className="divider" />
                <div className="meter-list">
                  {[5, 4, 3, 2, 1].map((rating) => {
                    const count = Number(data.csatDistribution[String(rating)] ?? 0);
                    const share = percent(count, stats.csatCount);
                    return (
                      <div key={rating}>
                        <div className="meter-top">
                          <span>{rating} star{rating > 1 ? "s" : ""}</span>
                          <b>{count}</b>
                        </div>
                        <div className="meter-track" style={{ height: 5 }}>
                          <div
                            className="meter-fill"
                            style={{ width: `${share}%`, background: rating >= 4 ? "var(--accent)" : rating === 3 ? "#c2a164" : "var(--danger)" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </div>

          <div className="cols cols-2-1" style={{ marginTop: 14 }}>
            <Card>
              <CardHead
                title="Team details"
                description="Replies, completed requests, customer ratings, and overdue work."
                action={
                  <Link to="/admin/team" className="btn btn-ghost btn-sm">
                    Team detail <ArrowUpRight size={14} />
                  </Link>
                }
              />
              <PaginatedList items={data.agents} label="team members">
                {(pageItems) => (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Agent</th>
                          <th>Open</th>
                          <th>Resolved</th>
                          <th>First reply</th>
                          <th>CSAT</th>
                          <th>Late</th>
                          <th>Performance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageItems.map((agent) => (
                          <tr
                            key={agent.id}
                            className="clickable"
                            onClick={() => navigate(`/admin/requests?assignee=${agent.id}`)}
                            tabIndex={0}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") navigate(`/admin/requests?assignee=${agent.id}`);
                            }}
                          >
                            <td>
                              <div className="cell-title">{agent.name}</div>
                              <div className="cell-sub">{agent.title ?? "Support agent"}</div>
                            </td>
                            <td>{agent.openAssigned}</td>
                            <td>{agent.resolved30d}</td>
                            <td>{formatMinutes(agent.avgFirstResponseMinutes)}</td>
                            <td>{agent.avgCsat === null ? "—" : `${agent.avgCsat.toFixed(1)} / 5`}</td>
                            <td>
                              {agent.lateAssigned ? (
                                <span className="badge badge-late">{agent.lateAssigned}</span>
                              ) : (
                                <span className="muted">0</span>
                              )}
                            </td>
                            <td>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/admin/reports?agent=${agent.id}`);
                                }}
                              >
                                View report
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </PaginatedList>
            </Card>

            <Card>
              <CardHead title="Recent activity" description="Assignment, status, and resolution events." />
              <div className="card-body" style={{ paddingTop: 6, paddingBottom: 8 }}>
                <div className="feed">
                  {data.recentActivity.map((event) => (
                    <Link key={event.id} to={`/admin/requests/${event.ticket.id}`} className="feed-item">
                      <p>
                        <strong>{event.actorName ?? "System"}</strong> — {event.label}
                      </p>
                      <div className="feed-top">
                        <span className="row-ref">{event.ticket.ref}</span>
                        <span>{relativeTime(event.createdAt)}</span>
                      </div>
                    </Link>
                  ))}
                  {!data.recentActivity.length ? <p className="small muted">No activity recorded yet.</p> : null}
                </div>
              </div>
            </Card>
          </div>

          <Card style={{ marginTop: 14 }}>
            <CardHead title="Assistant results" description="What happened after customers started a support chat." />
            <div className="card-body">
              <div className="assistant-outcome-track" role="img" aria-label={`${assistantResolved} resolved in chat and ${stats.botEscalated} handed to the team`}>
                <span className="assistant-outcome-resolved" style={{ width: `${assistantResolvedPct}%` }} />
                <span className="assistant-outcome-escalated" style={{ width: `${assistantEscalatedPct}%` }} />
              </div>
              <div className="assistant-outcome-legend">
                <span><i className="legend-dot resolved" /> Resolved in chat: {assistantResolved}</span>
                <span><i className="legend-dot escalated" /> Sent to the team: {stats.botEscalated}</span>
                <span className="muted">{assistantTotal} conversations</span>
              </div>
              <div className="row" style={{ gap: 26, flexWrap: "wrap" }}>
                <div>
                  <p className="stat-label">Conversations</p>
                  <p className="agent-stat">
                    <b style={{ fontFamily: "var(--serif)", fontSize: 24 }}>{stats.botConversations}</b>
                  </p>
                </div>
                <div>
                  <p className="stat-label">Handed to IT</p>
                  <p style={{ fontFamily: "var(--serif)", fontSize: 24 }}>{stats.botEscalated}</p>
                </div>
                <div>
                  <p className="stat-label">Resolved in chat</p>
                  <p style={{ fontFamily: "var(--serif)", fontSize: 24 }}>
                    {Math.max(0, stats.botConversations - stats.botEscalated)}
                  </p>
                </div>
                <Link to="/admin/conversations" className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }}>
                  <Ticket size={14} /> Review conversations
                </Link>
              </div>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
