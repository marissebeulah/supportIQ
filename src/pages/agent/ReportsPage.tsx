import { Link } from "react-router-dom";
import { Inbox, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { api } from "../../lib/api";
import { useApi, useRealtime, useTitle } from "../../lib/hooks";
import type { AgentPerformanceReport } from "../../lib/types";
import { Button, Card, EmptyState, PageHead, Spinner } from "../../components/ui";
import { AgentPerformanceView } from "../../components/AgentPerformanceView";
import { PrintHeader, ReportActions } from "../../components/ReportActions";
import { useToast } from "../../components/toast";
import { agentReportCsv, agentReportFilename, downloadCsv } from "../../lib/reporting";

export default function AgentReportsPage() {
  useTitle("My performance report");
  const { toast } = useToast();

  const report = useApi<AgentPerformanceReport>(() =>
    api.get<AgentPerformanceReport>("/api/reports/dashboard")
  );
  useRealtime(() => report.reload());

  const data = report.data;

  const refresh = () => {
    report.reload();
    toast("Performance data refreshed.", "info");
  };

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(agentReportFilename(data), agentReportCsv(data));
    toast("Your report was exported as CSV.", "info");
  };

  return (
    <>
      <PageHead
        eyebrow="IT support portal · Reports"
        title="My performance report"
        description="Your personal ticket resolution metrics, response times, SLA compliance, and customer satisfaction. Print this page or export the data as CSV."
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
              <ShieldCheck size={14} /> Permission: Own performance
            </span>
            <Link to="/agent/queue" className="btn btn-secondary btn-md">
              <Inbox size={15} /> View queue
            </Link>
            <ReportActions onExport={exportCsv} disabled={!data} exportLabel="Export CSV" />
            <Button variant="secondary" onClick={refresh} loading={report.loading}>
              <RefreshCw size={15} /> Refresh
            </Button>
          </div>
        }
      />

      <PrintHeader
        title="My performance report"
        subtitle={data ? `${data.agent.name} · ${data.agent.title ?? "Support agent"}` : undefined}
      />

      {report.loading && !data ? (
        <Spinner label="Loading your performance report…" />
      ) : !data ? (
        <Card>
          <EmptyState
            icon={TriangleAlert}
            title="Performance data unavailable"
            body={report.error ?? "Could not load your report. Try refreshing."}
          />
        </Card>
      ) : (
        <div className="report-doc">
          <AgentPerformanceView data={data} portalRole="it" />
        </div>
      )}
    </>
  );
}
