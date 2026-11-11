import { useTitle } from "../../lib/hooks";
import { Card, PageHead } from "../../components/ui";

const rows = [
  ["Create tickets", "Yes", "No", "Yes, on behalf of a client"],
  ["View tickets", "Own tickets only", "Assigned tickets only", "All tickets"],
  ["Reply in ticket chat", "Own tickets", "Assigned tickets", "All tickets (step in)"],
  ["Change ticket status", "Confirm resolved; reply to reopen", "Yes", "Yes"],
  ["Reassign tickets", "No", "No", "Yes"],
  ["Edit bot replies, keywords, and help articles", "No", "No", "Yes"],
  ["Use saved replies", "No", "Yes", "Yes"],
  ["View dashboard and reports", "No", "Own performance", "All"],
  ["Manage user accounts", "No", "No", "Yes"],
  ["Edit or delete messages", "No", "No", "No"],
];

export default function PermissionsPage() {
  useTitle("Roles and permissions");

  return (
    <>
      <PageHead
        eyebrow="Admin monitoring"
        title="Roles & permissions"
        description="Access boundaries for customers, IT support, and administrators."
      />
      <Card>
        <div className="table-wrap permissions-table-wrap">
          <table className="table permissions-table">
            <thead>
              <tr>
                <th scope="col">Permission</th>
                <th scope="col">Customer</th>
                <th scope="col">Support Agent (IT)</th>
                <th scope="col">Admin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([permission, customer, it, admin]) => (
                <tr key={permission}>
                  <th scope="row" className="permissions-row-label">{permission}</th>
                  <td>{customer}</td>
                  <td>{it}</td>
                  <td>{admin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}