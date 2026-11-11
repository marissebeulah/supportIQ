import { Link } from "react-router-dom";
import { ArrowLeft, MessagesSquare, ShieldAlert } from "lucide-react";
import { useTitle } from "../../lib/hooks";
import { Card, PageHead } from "../../components/ui";

export default function ReportsAccessDeniedPage() {
  useTitle("Access Restricted — Reports");

  return (
    <>
      <PageHead
        eyebrow="Customer portal"
        title="Dashboard & reports access restricted"
        description="Customer accounts do not have permission to view operational dashboards or reports."
      />

      <Card style={{ maxWidth: 680, margin: "24px auto" }}>
        <div className="card-body" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(186, 37, 37, 0.1)",
              color: "var(--danger)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <ShieldAlert size={28} />
          </div>

          <h2 style={{ fontSize: 20, marginBottom: 8 }}>Access Denied (No access)</h2>
          <p className="muted" style={{ maxWidth: 480, margin: "0 auto 20px", lineHeight: 1.5 }}>
            Under SupportIQ role-based permissions, the <strong>View dashboard and reports</strong> permission is restricted.
            Customers have <strong>no access</strong> to service metrics, resolution targets, or agent performance reports.
          </p>

          <div
            style={{
              background: "var(--bg-subtle)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius)",
              padding: "16px",
              maxWidth: 480,
              margin: "0 auto 24px",
              textAlign: "left",
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Permission Matrix:</div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span>Customer</span>
              <strong style={{ color: "var(--danger)" }}>No access</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span>IT / Support Agent</span>
              <span>Own performance only</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span>Admin</span>
              <span>All reports and metrics</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <Link to="/portal" className="btn btn-secondary btn-md">
              <ArrowLeft size={15} /> Return to overview
            </Link>
            <Link to="/portal/requests" className="btn btn-primary btn-md">
              <MessagesSquare size={15} /> View my requests
            </Link>
          </div>
        </div>
      </Card>
    </>
  );
}

