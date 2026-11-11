import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  CheckCircle,
  Inbox,
  Star,
  TriangleAlert,
  Users,
} from "lucide-react";
import { api } from "../../lib/api";
import { useApi, useRealtime, useTitle } from "../../lib/hooks";
import { formatMinutes, formatNumber } from "../../lib/format";
import type { AdminOverview, AgentPerformanceReport } from "../../lib/types";
import { AnimatedNumber, Button, Card, CardHead, EmptyState, PageHead, SkeletonRows, SkeletonStats, Stars } from "../../components/ui";
import { AgentPerformanceView } from "../../components/AgentPerformanceView";
import { PrintHeader, ReportActions } from "../../components/ReportActions";
import { useToast } from "../../components/toast";
import {
  agentReportCsv,
  agentReportFilename,
  downloadCsv,
  teamReportCsv,
  teamReportFilename,
} from "../../lib/reporting";

export default function AdminReportsPage() {
  useTitle("Reports");
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const agentParam = searchParams.get("agent");
  const selectedAgentId =
    agentParam && /^\d+$/.test(agentParam) ? Number(agentParam) : null;

  const overview = useApi<AdminOverview>(() => api.get<AdminOverview>("/api/admin/overview"));
  const agentReport = useApi<AgentPerformanceReport>(
    () => api.get<AgentPerformanceReport>(`/api/reports/agent/${selectedAgentId}`),
    [selectedAgentId],
    { enabled: selectedAgentId !== null },
  );
  useRealtime(() => overview.reload());
  useRealtime(() => {
    if (selectedAgentId !== null) agentReport.reload();
  }, selectedAgentId !== null);

  const agents = overview.data?.agents ?? [];
  const agentData =
    selectedAgentId !== null && agentReport.data?.agent.id === selectedAgentId ? agentReport.data : null;

  const team = useMemo(() => {
    const open = agents.reduce((total, agent) => total + agent.openAssigned, 0);
    const resolved = agents.reduce((total, agent) => total + agent.resolved30d, 0);
    const late = agents.reduce((total, agent) => total + agent.lateAssigned, 0);
    const csatValues = agents
      .map((agent) => agent.avgCsat)
      .filter((value): value is number => value !== null);
    return {
      open,
      resolved,
      late,
      csat: csatValues.length
        ? csatValues.reduce((total, value) => total + value, 0) / csatValues.length
        : null,
    };
  }, [agents]);

  const selectAgent = (id: number | null) => {
    const next = new URLSearchParams(searchParams);
    if (id === null) next.delete("agent");
    else next.set("agent", String(id));
    setSearchParams(next);
  };

  const exportCsv = () => {
    if (selectedAgentId !== null && agentData) {
      downloadCsv(agentReportFilename(agentData), agentReportCsv(agentData));
      toast("Agent report exported as CSV.", "info");
      return;
    }
    if (overview.data) {
      downloadCsv(teamReportFilename(), teamReportCsv(overview.data.agents));
      toast("Team report exported as CSV.", "info");
    }
  };

  const canExport = selectedAgentId !== null ? Boolean(agentData) : Boolean(overview.data);
  const reportTitle =
    selectedAgentId !== null
      ? agentData
        ? `${agentData.agent.name} — performance report`
        : "Agent performance report"
      : "Team performance reports";
  const printSubtitle =
    selectedAgentId !== null
      ? agentData
        ? `${agentData.agent.title ?? "Support agent"} · ${agentData.agent.email}`
        : undefined
      : "Support team performance summary";

  return (
    <>
      <PageHead
        eyebrow="Support team · Reports"
        title={reportTitle}
        description={
          selectedAgentId !== null
            ? "A printable, exportable performance report for one team member. Use Print for a PDF or Export CSV for a spreadsheet."
            : "A printable summary of how the team is performing. Choose a team member to open their individual report, or export the team summary as CSV."
        }
        actions={
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            {selectedAgentId !== null ? (
              <Link to="/admin/reports" className="btn btn-ghost btn-md">
                All team reports
              </Link>
            ) : null}
            <select
              style={{
                height: 36,
                padding: "0 10px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--line)",
                background: "var(--surface)",
                color: "var(--text)",
                fontSize: 13,
              }}
              value={selectedAgentId ?? ""}
              onChange={(event) => selectAgent(event.target.value ? Number(event.target.value) : null)}
              aria-label="Choose a report"
            >
              <option value="">Team summary</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
            <ReportActions
              onExport={exportCsv}
              disabled={!canExport}
              exportLabel={selectedAgentId !== null ? "Export agent CSV" : "Export team CSV"}
            />
          </div>
        }
      />

      <PrintHeader title={reportTitle} subtitle={printSubtitle} />

      {selectedAgentId !== null ? (
        !agentData && !agentReport.error ? (
          <>
            <SkeletonStats count={7} />
            <Card>
              <SkeletonRows rows={5} />
            </Card>
          </>
        ) : !agentData ? (
          <Card>
            <EmptyState
              icon={TriangleAlert}
              title="Agent report unavailable"
              body={agentReport.error ?? "Could not load the agent report."}
              action={
                <Button variant="secondary" size="sm" onClick={() => selectAgent(null)}>
                  Back to team reports
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="report-doc">
            <AgentPerformanceView data={agentData} portalRole="admin" />
          </div>
        )
      ) : overview.loading && !overview.data ? (
        <>
          <SkeletonStats count={5} />
          <Card>
            <SkeletonRows rows={5} />
          </Card>
        </>
      ) : !overview.data ? (
        <Card>
          <EmptyState
            icon={TriangleAlert}
            title="Reports unavailable"
            body={overview.error ?? "Could not load team performance. Try refreshing."}
          />
        </Card>
      ) : (
        <div className="report-doc">
          <div className="stat-grid">
            <div className="stat is-accent">
              <span className="stat-icon">
                <Users size={17} />
              </span>
              <p className="stat-label">Team members</p>
              <p className="stat-value"><AnimatedNumber value={agents.length} /></p>
              <p className="stat-sub">Included in this report</p>
            </div>
            <div className="stat">
              <span className="stat-icon">
                <Inbox size={17} />
              </span>
              <p className="stat-label">Open assigned</p>
              <p className="stat-value"><AnimatedNumber value={team.open} format={formatNumber} /></p>
              <p className="stat-sub">Across the whole team</p>
            </div>
            <div className="stat">
              <span className="stat-icon">
                <CheckCircle size={17} />
              </span>
              <p className="stat-label">Resolved</p>
              <p className="stat-value"><AnimatedNumber value={team.resolved} format={formatNumber} /></p>
              <p className="stat-sub">Last 30 days</p>
            </div>
            <div className={`stat ${team.late ? "is-danger" : ""}`}>
              <span className="stat-icon">
                <TriangleAlert size={17} />
              </span>
              <p className="stat-label">Past due or at risk</p>
              <p className="stat-value"><AnimatedNumber value={team.late} format={formatNumber} /></p>
              <p className="stat-sub">{team.late ? "Needs follow-up" : "Everything on target"}</p>
            </div>
            <div className="stat is-accent">
              <span className="stat-icon">
                <Star size={17} />
              </span>
              <p className="stat-label">Average rating</p>
              <p className="stat-value">
                {team.csat === null ? "—" : team.csat.toFixed(1)}
                <span className="unit">/ 5</span>
              </p>
              <p className="stat-sub">Across rated team members</p>
            </div>
          </div>

          <Card>
            <CardHead
              title="Team performance"
              description="Open a team member's report for the full, printable breakdown."
              action={
                <Link to="/admin/team" className="btn btn-ghost btn-sm">
                  Team detail <ArrowUpRight size={14} />
                </Link>
              }
            />
            {agents.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Open</th>
                      <th>Resolved (30d)</th>
                      <th>First reply</th>
                      <th>CSAT</th>
                      <th>Late</th>
                      <th className="no-print">Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((agent) => (
                      <tr
                        key={agent.id}
                        className="clickable"
                        onClick={() => selectAgent(agent.id)}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") selectAgent(agent.id);
                        }}
                      >
                        <td>
                          <div className="cell-title">{agent.name}</div>
                          <div className="cell-sub">{agent.title ?? "Support agent"}</div>
                        </td>
                        <td>{agent.openAssigned}</td>
                        <td>{agent.resolved30d}</td>
                        <td>{formatMinutes(agent.avgFirstResponseMinutes)}</td>
                        <td>
                          {agent.avgCsat === null ? (
                            <span className="muted">—</span>
                          ) : (
                            <div className="row" style={{ gap: 6 }}>
                              <Stars value={Math.round(agent.avgCsat)} size="sm" />
                              <span>{agent.avgCsat.toFixed(1)}</span>
                            </div>
                          )}
                        </td>
                        <td>
                          {agent.lateAssigned ? (
                            <span className="badge badge-late">{agent.lateAssigned}</span>
                          ) : (
                            <span className="muted">0</span>
                          )}
                        </td>
                        <td className="no-print">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              selectAgent(agent.id);
                            }}
                          >
                            Open report
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title="No team members yet"
                body="Team performance will appear here once support agents have accounts."
              />
            )}
          </Card>
        </div>
      )}
    </>
  );
}
