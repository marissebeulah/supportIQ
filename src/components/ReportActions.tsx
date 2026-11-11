import { Download, Printer } from "lucide-react";
import { formatLongDate, formatTime } from "../lib/format";
import { Button } from "./ui";

export function ReportActions({
  onExport,
  exportLabel = "Export CSV",
  disabled = false,
}: {
  onExport: () => void;
  exportLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="report-actions no-print">
      <Button variant="secondary" onClick={() => window.print()} disabled={disabled}>
        <Printer size={15} /> Print
      </Button>
      <Button variant="secondary" onClick={onExport} disabled={disabled}>
        <Download size={15} /> {exportLabel}
      </Button>
    </div>
  );
}

export function PrintHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const now = new Date();
  return (
    <div className="print-only print-head">
      <div>
        <p className="print-brand">SupportIQ</p>
        <h1>{title}</h1>
        {subtitle ? <p className="print-sub">{subtitle}</p> : null}
      </div>
      <div className="print-meta">
        <span>{formatLongDate(now.toISOString())}</span>
        <span>Generated {formatTime(now.toISOString())}</span>
      </div>
    </div>
  );
}
