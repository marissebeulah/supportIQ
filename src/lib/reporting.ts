import { STATUS_META, STATUS_ORDER } from "./format";
import type { AdminAgent, AgentPerformanceReport } from "./types";

type Cell = string | number | null | undefined;

function csvCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Download a spreadsheet-friendly CSV with a UTF-8 BOM so Excel keeps accents. */
export function downloadCsv(filename: string, rows: Cell[][]): void {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "report"
  );
}

function fileStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function agentReportFilename(report: AgentPerformanceReport): string {
  return `supportiq-agent-report-${slug(report.agent.name)}-${fileStamp()}.csv`;
}

export function teamReportFilename(): string {
  return `supportiq-team-report-${fileStamp()}.csv`;
}

/** A full agent performance report as CSV rows, with titled sections. */
export function agentReportCsv(report: AgentPerformanceReport): Cell[][] {
  const { agent, stats } = report;
  const rows: Cell[][] = [
    ["SupportIQ - Agent performance report"],
    ["Agent", agent.name],
    ["Job title", agent.title ?? "Support agent"],
    ["Email", agent.email],
    ["Generated", new Date().toISOString()],
    [],
    ["Metric", "Value"],
    ["Active requests", stats.openAssigned],
    ["Open requests", stats.openCount],
    ["In progress", stats.inProgressCount],
    ["Waiting on customer", stats.waitingCustomerCount],
    ["Resolved (last 30 days)", stats.resolved30d],
    ["Resolved (all time)", stats.resolvedAllTime],
    ["Past due or at risk", stats.lateAssigned],
    ["Average first response (minutes)", stats.avgFirstResponseMinutes ?? ""],
    ["First response sample", stats.firstResponseSample],
    ["Average resolution (hours)", stats.avgResolutionHours ?? ""],
    ["Resolution sample", stats.resolutionSample],
    ["Customer rating (out of 5)", stats.csatAvg ?? ""],
    ["Rating count", stats.csatCount],
    ["Positive ratings (4-5 stars)", stats.csatPositive],
    ["Replies within target (%)", stats.responseSlaPct ?? ""],
    ["SLA sample", stats.responseSlaTotal],
    [],
    ["Request volume (14 days)"],
    ["Date", "Assigned", "Resolved"],
    ...report.volume.map((point) => [point.date, point.created, point.resolved]),
    [],
    ["Status breakdown"],
    ["Status", "Count"],
    ...STATUS_ORDER.map((status) => [STATUS_META[status].label, report.statusBreakdown[status] ?? 0]),
    [],
    ["Common topics (30 days)"],
    ["Category", "Count"],
    ...report.categories.map((item) => [item.category, item.count]),
    [],
    ["Customer feedback"],
    ["Reference", "Subject", "Customer", "Rating", "Comment", "Rated at"],
    ...report.feedback.map((item) => [
      item.ref,
      item.subject,
      item.customerName,
      item.rating,
      item.comment ?? "",
      item.ratedAt,
    ]),
    [],
    ["Late and at risk"],
    ["Reference", "Subject", "Customer", "Assignee", "Priority", "Status", "Updated"],
    ...report.lateTickets.map((ticket) => [
      ticket.ref,
      ticket.subject,
      ticket.customer.name,
      ticket.assignee?.name ?? "Unassigned",
      ticket.priority,
      ticket.status,
      ticket.updatedAt,
    ]),
  ];

  return rows;
}

/** Team-wide performance rows used by the admin reports page. */
export function teamReportCsv(agents: AdminAgent[]): Cell[][] {
  const totalOpen = agents.reduce((total, agent) => total + agent.openAssigned, 0);
  const totalResolved = agents.reduce((total, agent) => total + agent.resolved30d, 0);
  const totalLate = agents.reduce((total, agent) => total + agent.lateAssigned, 0);
  const csatValues = agents
    .map((agent) => agent.avgCsat)
    .filter((value): value is number => value !== null);

  return [
    ["SupportIQ - Team performance report"],
    ["Generated", new Date().toISOString()],
    ["Team members", agents.length],
    [],
    ["Agent", "Job title", "Open assigned", "Resolved (30 days)", "Avg first reply (minutes)", "Avg CSAT (out of 5)", "Past due"],
    ...agents.map((agent) => [
      agent.name,
      agent.title ?? "Support agent",
      agent.openAssigned,
      agent.resolved30d,
      agent.avgFirstResponseMinutes ?? "",
      agent.avgCsat ?? "",
      agent.lateAssigned,
    ]),
    [],
    ["Totals", "", totalOpen, totalResolved, "", csatValues.length ? csatValues.reduce((a, b) => a + b, 0) / csatValues.length : "", totalLate],
  ];
}
