import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  CheckCircle,
  FileText,
  Inbox,
  ShieldCheck,
  Star,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useApi, useRealtime, useTitle } from "../../lib/hooks";
import { firstName, formatMinutes, formatNumber, greeting, percent, relativeTime } from "../../lib/format";
import type { AgentPerformanceReport } from "../../lib/types";
import { AnimatedNumber, Card, CardHead, EmptyState, PageHead, ProductConcerns, SkeletonRows, SkeletonStats } from "../../components/ui";
import { LateTicketRow } from "../../components/LateTicketRow";

export default function AgentDashboardPage() {
  useTitle("Dashboard");
  const { user } = useAuth();
  const navigate = useNavigate();
  const report = useApi<AgentPerformanceReport>(() => api.get<AgentPerformanceReport>("/api/reports/dashboard"));
  useRealtime(() => report.reload());

  const data = report.data;
  const stats = data?.stats;
  const positivePct = stats && stats.csatCount ? percent(stats.csatPositive, stats.csatCount) : 0;

  return (
    <>
      <PageHead
        eyebrow="IT support portal"
        title={`${greeting()}, ${firstName(user?.name ?? "there")}`}
        description="Your workload at a glance. Open My reports for the full performance report you can print or export as CSV."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Link to="/agent/reports" className="btn btn-secondary btn-md">
              <FileText size={15} /> My reports
            </Link>
            <Link to="/agent/queue" className="btn btn-secondary btn-md">
              <Inbox size={15} /> Open queue
            </Link>
          </div>
        }
      />

      {report.loading && !data ? (
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
            title="Dashboard unavailable"
            body={report.error ?? "Could not load your workload. Try refreshing."}
          />
        </Card>
      ) : (
        <>
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
              <p className="stat-sub">last 30 days · {stats.resolvedAllTime} all time</p>
            </div>
            <div className={`stat ${stats.lateAssigned ? "is-danger" : ""}`}>
              <span className="stat-icon">
                <TriangleAlert size={17} />
              </span>
              <p className="stat-label">Past due or at risk</p>
              <p className="stat-value"><AnimatedNumber value={stats.lateAssigned} /></p>
              <p className="stat-sub">
                {stats.lateAssigned ? "Needs a quick response or fix" : "All tickets within target"}
              </p>
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
                title="Needs attention"
                description="Assigned requests that may need a reply or resolution soon."
                action={
                  <Link to="/agent/queue" className="btn btn-ghost btn-sm">
                    Open queue <ArrowUpRight size={14} />
                  </Link>
                }
              />
              {data.lateTickets.length ? (
                <div className="ticket-rows">
                  {data.lateTickets.map((ticket) => (
                    <LateTicketRow
                      key={ticket.id}
                      ticket={ticket}
                      onOpen={() => navigate(`/agent/tickets/${ticket.id}`)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={ShieldCheck}
                  title="Everything is on target"
                  body="No assigned request is currently breaching its service target."
                />
              )}
            </Card>

            <Card>
              <CardHead
                title="Your recent activity"
                description="Actions you took on your assigned requests."
                action={
                  <Link to="/agent/queue" className="btn btn-ghost btn-sm">
                    Open queue <ArrowUpRight size={14} />
                  </Link>
                }
              />
              <div className="card-body" style={{ paddingTop: 6, paddingBottom: 8 }}>
                <div className="feed">
                  {data.recentActivity.map((event) => (
                    <Link key={event.id} to={`/agent/tickets/${event.ticket.id}`} className="feed-item">
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
            <CardHead
              title="Concerns by product"
              description="Your assigned requests grouped by the product they concern. Select a product to review its queue."
            />
            <div className="card-body">
              <ProductConcerns
                items={data.products}
                onSelect={(id) =>
                  navigate(id === null ? "/agent/queue?productId=none" : `/agent/queue?productId=${id}`)
                }
                emptyLabel="Product concerns will appear here as requests are assigned to you."
              />
            </div>
          </Card>
        </>
      )}
    </>
  );
}
