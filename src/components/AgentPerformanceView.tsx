import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle,
  Clock,
  Inbox,
  ShieldCheck,
  Star,
  Timer,
  TriangleAlert,
} from "lucide-react";
import {
  STATUS_META,
  STATUS_ORDER,
  formatHours,
  formatMinutes,
  formatNumber,
  percent,
  relativeTime,
} from "../lib/format";
import type { AgentPerformanceReport } from "../lib/types";
import { AnimatedNumber, Button, Card, CardHead, EmptyState, Stars } from "./ui";
import { LateTicketRow } from "./LateTicketRow";
import { VolumeChart } from "./VolumeChart";

const STATUS_COLORS: Record<string, string> = {
  open: "#1f4bc4",
  in_progress: "#c2801a",
  waiting_customer: "#8151cc",
  resolved: "#0f5d4c",
  closed: "#8d93a1",
};

export function AgentPerformanceView({
  data,
  portalRole,
  onBack,
}: {
  data: AgentPerformanceReport;
  portalRole: "it" | "admin";
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  const stats = data.stats;
  const agent = data.agent;

  const statusTotal = STATUS_ORDER.reduce(
    (total, status) => total + (data.statusBreakdown[status] ?? 0),
    0
  );
  const positivePct =
    stats && stats.csatCount ? percent(stats.csatPositive, stats.csatCount) : 0;
  const maxCategoryCount = Math.max(
    1,
    ...(data.categories.map((item) => item.count) ?? [])
  );

  const ticketLinkPrefix = portalRole === "admin" ? "/admin/requests" : "/agent/tickets";
  const queueLinkPrefix = portalRole === "admin" ? `/admin/requests?assignee=${agent.id}` : "/agent/queue";

  return (
    <>
      {portalRole === "admin" && onBack ? (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            background: "var(--bg-subtle)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft size={14} /> Back to all operations
            </Button>
            <span className="dot-sep" style={{ color: "var(--muted)", fontSize: 13 }}>
              Drill-down: <strong>{agent.name}</strong> ({agent.title ?? "Support agent"})
            </span>
          </div>
          <span
            className="badge"
            style={{
              background: "rgba(23, 107, 135, 0.12)",
              color: "var(--primary)",
              fontWeight: 600,
            }}
          >
            Admin: Viewing individual agent report
          </span>
        </div>
      ) : null}

      <div className="stat-grid">
        <div className="stat is-accent">
          <span className="stat-icon">
            <Inbox size={17} />
          </span>
          <p className="stat-label">Active requests</p>
          <p className="stat-value"><AnimatedNumber value={stats.openAssigned} /></p>
          <p className="stat-sub">
            {stats.openCount} open · {stats.inProgressCount} in progress
          </p>
        </div>

        <div className="stat">
          <span className="stat-icon">
            <CheckCircle size={17} />
          </span>
          <p className="stat-label">Resolved requests</p>
          <p className="stat-value"><AnimatedNumber value={stats.resolved30d} /></p>
          <p className="stat-sub">
            last 30 days · {stats.resolvedAllTime} all time
          </p>
        </div>

        <div className={`stat ${stats.lateAssigned ? "is-danger" : ""}`}>
          <span className="stat-icon">
            <TriangleAlert size={17} />
          </span>
          <p className="stat-label">Past due or at risk</p>
          <p className="stat-value"><AnimatedNumber value={stats.lateAssigned} /></p>
          <p className="stat-sub">
            {stats.lateAssigned
              ? "Needs a quick response or fix"
              : "All tickets within target"}
          </p>
        </div>

        <div className="stat">
          <span className="stat-icon">
            <Timer size={17} />
          </span>
          <p className="stat-label">Response time</p>
          <p className="stat-value">
            {formatMinutes(stats.avgFirstResponseMinutes)}
          </p>
          <p className="stat-sub">
            Avg first reply ({formatNumber(stats.firstResponseSample)} sample)
          </p>
        </div>

        <div className="stat">
          <span className="stat-icon">
            <Clock size={17} />
          </span>
          <p className="stat-label">Resolution time</p>
          <p className="stat-value">
            {formatHours(stats.avgResolutionHours)}
          </p>
          <p className="stat-sub">
            Avg resolution ({formatNumber(stats.resolutionSample)} sample)
          </p>
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
          <p className="stat-sub">
            on {formatNumber(stats.responseSlaTotal)} responded requests
          </p>
        </div>
      </div>

      <div className="cols cols-2-1">
        <Card>
          <CardHead
            title={portalRole === "it" ? "My request volume" : `${agent.name}'s request volume`}
            description="Assigned and resolved requests across the last 14 days."
            action={
              <Link to={queueLinkPrefix} className="btn btn-ghost btn-sm">
                Assigned requests <ArrowUpRight size={14} />
              </Link>
            }
          />
          <div className="chart-wrap">
            <VolumeChart data={data.volume} />
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-dot created" /> Assigned
            </span>
            <span>
              <i className="legend-dot resolved" /> Resolved
            </span>
            <span style={{ marginLeft: "auto" }}>UTC days</span>
          </div>
        </Card>

        <Card>
          <CardHead
            title={portalRole === "it" ? "My request progress" : `${agent.name}'s request progress`}
            description={`Status breakdown for ${formatNumber(statusTotal)} assigned tickets.`}
          />
          <div className="card-body">
            {statusTotal === 0 ? (
              <p className="small muted">No assigned requests yet.</p>
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
                          style={{
                            width: `${share}%`,
                            background: STATUS_COLORS[status],
                          }}
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

      <div className="cols cols-2-1" style={{ marginTop: 14 }}>
        <Card>
          <CardHead
            title="Customer feedback on service"
            description={
              portalRole === "it"
                ? "Ratings and comments left by customers for tickets you resolved."
                : `Ratings and comments left by customers for tickets resolved by ${agent.name}.`
            }
          />
          <div className="card-body">
            <div className="row" style={{ alignItems: "flex-end", gap: 10 }}>
              <span
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: 38,
                  lineHeight: 1,
                }}
              >
                {stats.csatAvg === null ? "—" : stats.csatAvg.toFixed(1)}
              </span>
              <div style={{ paddingBottom: 3 }}>
                <Stars value={Math.round(stats.csatAvg ?? 0)} size="sm" />
                <p className="small muted" style={{ marginTop: 3 }}>
                  {stats.csatCount} ratings · {positivePct}% positive (4-5 stars)
                </p>
              </div>
            </div>

            <div className="divider" />

            <div className="meter-list" style={{ marginBottom: 20 }}>
              {[5, 4, 3, 2, 1].map((rating) => {
                const count = Number(
                  data.csatDistribution[String(rating)] ?? 0
                );
                const share = percent(count, stats.csatCount);
                return (
                  <div key={rating}>
                    <div className="meter-top">
                      <span>
                        {rating} star{rating > 1 ? "s" : ""}
                      </span>
                      <b>{count}</b>
                    </div>
                    <div className="meter-track" style={{ height: 5 }}>
                      <div
                        className="meter-fill"
                        style={{
                          width: `${share}%`,
                          background:
                            rating >= 4
                              ? "var(--accent)"
                              : rating === 3
                              ? "#c2a164"
                              : "var(--danger)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {data.feedback.length ? (
              <div className="stack" style={{ gap: 10 }}>
                <h3
                  style={{
                    fontSize: 13,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--muted)",
                  }}
                >
                  Recent customer reviews
                </h3>
                {data.feedback.map((item) => (
                  <div
                    key={item.ticketId}
                    style={{
                      background: "var(--bg-subtle)",
                      border: "1px solid var(--line)",
                      borderRadius: "var(--radius)",
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>
                          {item.customerName}
                        </span>
                        <span
                          className="dot-sep"
                          style={{ fontSize: 12, color: "var(--muted)" }}
                        >
                          {item.ref}
                        </span>
                      </div>
                      <Stars value={item.rating} size="sm" />
                    </div>
                    {item.comment ? (
                      <p
                        style={{
                          fontSize: 13,
                          fontStyle: "italic",
                          margin: "4px 0",
                          color: "var(--text)",
                        }}
                      >
                        "{item.comment}"
                      </p>
                    ) : null}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: 4,
                      }}
                    >
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>
                        {relativeTime(item.ratedAt)}
                      </span>
                      <Link
                        to={`${ticketLinkPrefix}/${item.ticketId}`}
                        className="no-print"
                        style={{
                          fontSize: 12,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        View ticket <ArrowUpRight size={12} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="small muted">No customer feedback comments yet.</p>
            )}
          </div>
        </Card>

        <div className="stack">
          <Card>
            <CardHead
              title="Common topics"
              description="Topics of assigned requests over the last 30 days."
            />
            <div className="card-body">
              {data.categories.length ? (
                <div className="overview-bars" aria-label="Requests by topic">
                  {data.categories.map((item, index) => {
                    const colors = [
                      "#0f5d4c",
                      "#1f4bc4",
                      "#c2801a",
                      "#8151cc",
                      "#a8331f",
                    ];
                    const totalCategoryRequests = data.categories.reduce(
                      (total, cat) => total + cat.count,
                      0
                    );
                    const share = percent(item.count, totalCategoryRequests);
                    return (
                      <div className="overview-bar-item" key={item.category}>
                        <div className="overview-bar-meta">
                          <span>{item.category}</span>
                          <b>{item.count}</b>
                        </div>
                        <div className="overview-bar-track" aria-hidden="true">
                          <div
                            className="overview-bar-fill"
                            style={{
                              width: `${(item.count / maxCategoryCount) * 100}%`,
                              background: colors[index % colors.length],
                            }}
                          />
                        </div>
                        <span className="overview-bar-share">
                          {share}% of workload
                        </span>
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
            <CardHead
              title="Late & at risk"
              description="Requests that may need an immediate reply or resolution."
              action={
                <Link to={queueLinkPrefix} className="btn btn-ghost btn-sm">
                  View assigned <ArrowUpRight size={14} />
                </Link>
              }
            />
            {data.lateTickets.length ? (
              <div className="ticket-rows">
                {data.lateTickets.map((ticket) => (
                  <LateTicketRow
                    key={ticket.id}
                    ticket={ticket}
                    onOpen={() => navigate(`${ticketLinkPrefix}/${ticket.id}`)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={ShieldCheck}
                title="All on target"
                body="None of the assigned requests are currently late or past due."
              />
            )}
          </Card>
        </div>
      </div>

    </>
  );
}

