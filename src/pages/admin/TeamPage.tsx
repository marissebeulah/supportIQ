import { Link } from "react-router-dom";
import { ArrowUpRight, Crown, MessageSquare, RefreshCw, Users } from "lucide-react";
import { api } from "../../lib/api";
import { useApi, useRealtime, useTitle } from "../../lib/hooks";
import { formatMinutes } from "../../lib/format";
import type { AdminAgent } from "../../lib/types";
import {
  AnimatedNumber,
  Avatar,
  Button,
  Card,
  EmptyState,
  PageHead,
  SkeletonRows,
  SkeletonStats,
  Stars,
} from "../../components/ui";

const MEDALS = ["is-first", "is-second", "is-third"] as const;
const ORDINALS = ["1st", "2nd", "3rd"] as const;

/** Busiest resolvers first, then quality, then the fastest first reply. */
function rankAgents(agents: AdminAgent[]): AdminAgent[] {
  return [...agents].sort(
    (a, b) =>
      b.resolved30d - a.resolved30d ||
      (b.avgCsat ?? -1) - (a.avgCsat ?? -1) ||
      (a.avgFirstResponseMinutes ?? Number.MAX_SAFE_INTEGER) -
        (b.avgFirstResponseMinutes ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name),
  );
}

function scoreShare(value: number, top: number): number {
  if (top <= 0) return 8;
  return Math.max(8, Math.round((value / top) * 100));
}

export default function TeamPage() {
  useTitle("IT team");
  const team = useApi<{ agents: AdminAgent[] }>(() => api.get<{ agents: AdminAgent[] }>("/api/admin/team"));
  useRealtime(() => team.reload());

  const agents = team.data?.agents ?? [];
  const ranked = rankAgents(agents);
  const podium = ranked.slice(0, 3);
  const others = ranked.slice(3);
  const topResolved = ranked[0]?.resolved30d ?? 0;

  const totalResolved = agents.reduce((total, agent) => total + agent.resolved30d, 0);
  const replySamples = agents
    .map((agent) => agent.avgFirstResponseMinutes)
    .filter((value): value is number => value !== null);
  const teamReply = replySamples.length
    ? replySamples.reduce((total, value) => total + value, 0) / replySamples.length
    : null;
  const rated = agents
    .map((agent) => agent.avgCsat)
    .filter((value): value is number => value !== null);
  const teamCsat = rated.length ? rated.reduce((total, value) => total + value, 0) / rated.length : null;

  return (
    <>
      <PageHead
        eyebrow="Admin monitoring"
        title="IT team"
        description="Recognition and a quick side-by-side of the IT team over the last 30 days. Full metrics live in Reports."
        actions={
          <Button variant="secondary" onClick={() => team.reload()} loading={team.loading}>
            <RefreshCw size={15} /> Refresh
          </Button>
        }
      />

      {team.loading && !team.data ? (
        <>
          <SkeletonStats count={3} />
          <Card>
            <SkeletonRows rows={5} />
          </Card>
        </>
      ) : ranked.length ? (
        <>
          <div className="team-summary">
            <span className="team-summary-item">
              <b>{agents.length}</b>
              <span>{agents.length === 1 ? "agent" : "agents"}</span>
            </span>
            <span className="team-summary-item">
              <b>{totalResolved}</b>
              <span>resolved in 30 days</span>
            </span>
            <span className="team-summary-item">
              <b>{formatMinutes(teamReply)}</b>
              <span>team avg first reply</span>
            </span>
            <span className="team-summary-item">
              <b>{teamCsat === null ? "—" : teamCsat.toFixed(1)}</b>
              <span>team CSAT / 5</span>
            </span>
          </div>

          <div className="podium">
            {podium.map((agent, index) => {
              const share = scoreShare(agent.resolved30d, topResolved);
              return (
                <article className={`podium-card ${MEDALS[index]}`} key={agent.id}>
                  <span className="podium-rank">
                    {index === 0 ? <Crown size={12} /> : null}
                    {ORDINALS[index]} place
                  </span>

                  <div className="podium-head">
                    <span className="podium-avatar">
                      <Avatar name={agent.name} size={index === 0 ? "lg" : "md"} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <p className="agent-name">{agent.name}</p>
                      <p className="agent-title">{agent.title ?? "Support agent"}</p>
                    </div>
                  </div>

                  <p className="podium-score">
                    <AnimatedNumber value={agent.resolved30d} />
                    <small>resolved · 30d</small>
                  </p>

                  <div className="podium-bar-track" aria-hidden>
                    <span className="podium-bar-fill" style={{ width: `${share}%` }} />
                  </div>

                  <p className="podium-meta">
                    <span>
                      First reply <b>{formatMinutes(agent.avgFirstResponseMinutes)}</b>
                    </span>
                    <span>
                      CSAT <b>{agent.avgCsat === null ? "—" : agent.avgCsat.toFixed(1)}</b>
                    </span>
                    <span>
                      Open <b>{agent.openAssigned}</b>
                    </span>
                  </p>

                  <div className="podium-actions">
                    <Link to={`/admin/messages?userId=${agent.id}`} className="btn btn-secondary btn-sm">
                      <MessageSquare size={14} /> Message
                    </Link>
                    <Link to={`/admin/requests?assignee=${agent.id}`} className="btn btn-ghost btn-sm">
                      Requests <ArrowUpRight size={14} />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          {others.length ? (
            <Card className="team-table-card">
              <div className="card-head">
                <div>
                  <p className="card-title">Everyone else</p>
                  <p className="card-desc">Ranked {others.length + 1} and below on the same 30-day figures.</p>
                </div>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th aria-label="Rank">#</th>
                      <th>Member</th>
                      <th>Resolved · 30d</th>
                      <th>Open assigned</th>
                      <th>Avg first reply</th>
                      <th>CSAT</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {others.map((agent, index) => (
                      <tr key={agent.id}>
                        <td>
                          <span className="team-rank-badge">{index + 4}</span>
                        </td>
                        <td>
                          <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                            <Avatar name={agent.name} size="sm" />
                            <div style={{ minWidth: 0 }}>
                              <div className="cell-title">{agent.name}</div>
                              <div className="cell-sub">{agent.email}</div>
                              {agent.title ? <div className="cell-sub">{agent.title}</div> : null}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="team-resolved">
                            <b>{agent.resolved30d}</b>
                            <span className="podium-bar-track" aria-hidden>
                              <span
                                className="podium-bar-fill"
                                style={{ width: `${scoreShare(agent.resolved30d, topResolved)}%` }}
                              />
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={agent.lateAssigned > 0 ? "badge badge-late" : ""}>
                            {agent.openAssigned}
                            {agent.lateAssigned > 0 ? ` (${agent.lateAssigned} late)` : ""}
                          </span>
                        </td>
                        <td>{formatMinutes(agent.avgFirstResponseMinutes)}</td>
                        <td>
                          {agent.avgCsat === null ? (
                            <span className="muted">—</span>
                          ) : (
                            <span className="team-csat">
                              <Stars value={agent.avgCsat} size="sm" />
                              <b>{agent.avgCsat.toFixed(1)}</b>
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                            <Link to={`/admin/messages?userId=${agent.id}`} className="btn btn-secondary btn-sm">
                              <MessageSquare size={13} /> Message
                            </Link>
                            <Link to={`/admin/requests?assignee=${agent.id}`} className="btn btn-ghost btn-sm">
                              Requests <ArrowUpRight size={13} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <p className="small muted" style={{ marginTop: 4 }}>
              Everyone is on the podium — add more IT members from Accounts to widen the comparison.
            </p>
          )}
        </>
      ) : (
        <Card>
          <EmptyState
            icon={Users}
            title="No IT staff yet"
            body="IT accounts added from the Accounts page show up here with their 30-day comparison."
          />
        </Card>
      )}
    </>
  );
}
