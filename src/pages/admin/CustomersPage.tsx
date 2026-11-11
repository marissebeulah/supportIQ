import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Building2,
  CheckCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Ticket,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import { api } from "../../lib/api";
import { useApi, useRealtime, useTitle } from "../../lib/hooks";
import { relativeTime } from "../../lib/format";
import type { AdminCustomerAccount, AdminCustomerDetail } from "../../lib/types";
import {
  AnimatedNumber,
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Modal,
  PageHead,
  PaginatedList,
  Select,
  SkeletonRows,
  SkeletonStats,
  Spinner,
} from "../../components/ui";
import { useToast } from "../../components/toast";

type EditForm = {
  name: string;
  email: string;
  company: string;
  active: boolean;
  password: string;
};

type CreateForm = {
  name: string;
  email: string;
  company: string;
  password: string;
};

const EMPTY_CREATE: CreateForm = { name: "", email: "", company: "", password: "" };

export default function CustomersPage() {
  useTitle("Customer accounts");
  const { toast } = useToast();
  const customersQuery = useApi<{ customers: AdminCustomerAccount[] }>(() =>
    api.get<{ customers: AdminCustomerAccount[] }>("/api/admin/customers?includeInactive=1"),
  );
  useRealtime(() => customersQuery.reload());

  const customers = customersQuery.data?.customers ?? [];
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");

  const [selected, setSelected] = useState<AdminCustomerAccount | null>(null);
  const [detail, setDetail] = useState<AdminCustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [createError, setCreateError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const active = customers.filter((customer) => customer.active).length;
    const withOpen = customers.filter((customer) => customer.openCount > 0).length;
    const companies = new Set(
      customers.map((customer) => customer.company?.trim().toLowerCase()).filter(Boolean),
    ).size;
    return { total: customers.length, active, withOpen, companies };
  }, [customers]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return customers.filter((customer) => {
      if (status !== "all" && customer.active !== (status === "active")) return false;
      if (!term) return true;
      return [customer.name, customer.email, customer.company ?? ""].join(" ").toLowerCase().includes(term);
    });
  }, [customers, search, status]);

  const hasFilters = Boolean(search) || status !== "all";

  const openAccount = async (customer: AdminCustomerAccount) => {
    setSelected(customer);
    setEditForm({
      name: customer.name,
      email: customer.email,
      company: customer.company ?? "",
      active: customer.active,
      password: "",
    });
    setEditError(null);
    setDetail(null);
    setDetailLoading(true);
    try {
      const response = await api.get<{ customer: AdminCustomerDetail }>(
        `/api/admin/customers/${customer.id}`,
      );
      setDetail(response.customer);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not load this account.");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeAccount = () => {
    if (saving) return;
    setSelected(null);
    setDetail(null);
    setEditForm(null);
    setEditError(null);
  };

  const saveAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !editForm || saving) return;
    if (editForm.name.trim().length < 2) {
      setEditError("Enter a name with at least 2 characters.");
      return;
    }
    if (editForm.password && (editForm.password.length < 8 || editForm.password.length > 128)) {
      setEditError("Use a password between 8 and 128 characters.");
      return;
    }

    setSaving(true);
    setEditError(null);
    try {
      const payload: Record<string, unknown> = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        company: editForm.company.trim(),
        active: editForm.active,
      };
      if (editForm.password) payload.password = editForm.password;

      const response = await api.patch<{ customer: AdminCustomerAccount }>(
        `/api/admin/customers/${selected.id}`,
        payload,
      );
      customersQuery.reload();
      toast(`${response.customer.name}'s account updated.`);
      if (editForm.password) {
        toast("Password reset. The customer has been signed out of existing sessions.", "info");
      }
      closeAccount();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not update the account.");
    } finally {
      setSaving(false);
    }
  };

  const createAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (createForm.name.trim().length < 2) {
      setCreateError("Enter a name with at least 2 characters.");
      return;
    }
    setSaving(true);
    setCreateError(null);
    try {
      const response = await api.post<{ customer: AdminCustomerAccount }>("/api/admin/customers", {
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        company: createForm.company.trim(),
        password: createForm.password,
      });
      customersQuery.reload();
      setCreating(false);
      setCreateForm(EMPTY_CREATE);
      toast(`${response.customer.name}'s account created.`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not create the account.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Admin monitoring"
        title="Customer accounts"
        description="Review every customer account, open their history, and update their details or access."
        actions={
          <>
            <Button
              onClick={() => {
                setCreateForm(EMPTY_CREATE);
                setCreateError(null);
                setCreating(true);
              }}
            >
              <UserPlus size={15} /> Add customer
            </Button>
            <Button variant="secondary" onClick={() => customersQuery.reload()} loading={customersQuery.loading}>
              <RefreshCw size={15} /> Refresh
            </Button>
          </>
        }
      />

      {customersQuery.loading && !customersQuery.data ? (
        <>
          <SkeletonStats count={4} />
          <Card>
            <SkeletonRows rows={5} />
          </Card>
        </>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat is-accent">
              <span className="stat-icon">
                <Users size={17} />
              </span>
              <p className="stat-label">Customer accounts</p>
              <p className="stat-value"><AnimatedNumber value={stats.total} /></p>
              <p className="stat-sub">{stats.active} active</p>
            </div>
            <div className={`stat ${stats.total - stats.active ? "is-warn" : ""}`}>
              <span className="stat-icon">
                <UserX size={17} />
              </span>
              <p className="stat-label">Deactivated</p>
              <p className="stat-value"><AnimatedNumber value={stats.total - stats.active} /></p>
              <p className="stat-sub">{stats.total - stats.active ? "Signed out and blocked" : "All accounts active"}</p>
            </div>
            <div className="stat">
              <span className="stat-icon">
                <Ticket size={17} />
              </span>
              <p className="stat-label">With open requests</p>
              <p className="stat-value"><AnimatedNumber value={stats.withOpen} /></p>
              <p className="stat-sub">Customers waiting on IT</p>
            </div>
            <div className="stat">
              <span className="stat-icon">
                <Building2 size={17} />
              </span>
              <p className="stat-label">Companies</p>
              <p className="stat-value"><AnimatedNumber value={stats.companies} /></p>
              <p className="stat-sub">Distinct organisations</p>
            </div>
          </div>

          <div className="filters">
            <div className="search">
              <Search size={15} />
              <input
                className="input"
                type="search"
                placeholder="Search name, email, or company…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search customer accounts"
              />
            </div>
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value as "all" | "active" | "inactive")}
              aria-label="Filter by account status"
            >
              <option value="all">All accounts</option>
              <option value="active">Active</option>
              <option value="inactive">Deactivated</option>
            </Select>
            {hasFilters ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatus("all");
                }}
              >
                Clear
              </Button>
            ) : null}
            <span className="small muted" style={{ marginLeft: "auto" }}>
              {filtered.length} of {customers.length}
            </span>
          </div>

          <Card>
            {filtered.length ? (
              <PaginatedList items={filtered} label="customer accounts">
                {(pageItems) => (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Company</th>
                          <th>Requests</th>
                          <th>Assistant chats</th>
                          <th>Status</th>
                          <th>Last activity</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {pageItems.map((customer) => (
                          <tr
                            key={customer.id}
                            className="clickable"
                            onClick={() => openAccount(customer)}
                            tabIndex={0}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                openAccount(customer);
                              }
                            }}
                          >
                            <td>
                              <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                                <Avatar name={customer.name} size="sm" />
                                <div style={{ minWidth: 0 }}>
                                  <div className="cell-title">{customer.name}</div>
                                  <div className="cell-sub">{customer.email}</div>
                                </div>
                              </div>
                            </td>
                            <td>{customer.company?.trim() || <span className="muted">—</span>}</td>
                            <td>
                              <span className="cell-title">{customer.openCount} open</span>
                              <div className="cell-sub">{customer.ticketCount} total</div>
                            </td>
                            <td>{customer.conversationCount}</td>
                            <td>
                              {customer.active ? (
                                <span className="badge badge-approved">
                                  <CheckCircle size={11} /> Active
                                </span>
                              ) : (
                                <span className="badge badge-late">
                                  <UserX size={11} /> Deactivated
                                </span>
                              )}
                            </td>
                            <td className="muted">
                              {customer.lastActivityAt ? relativeTime(customer.lastActivityAt) : "No activity"}
                            </td>
                            <td>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openAccount(customer);
                                }}
                              >
                                <Pencil size={13} /> Edit
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </PaginatedList>
            ) : (
              <EmptyState
                icon={Users}
                title={hasFilters ? "No matching customers" : "No customer accounts yet"}
                body={
                  hasFilters
                    ? "Adjust the search or status filter to see more accounts."
                    : "Customer accounts appear here once they are created."
                }
                action={
                  hasFilters ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSearch("");
                        setStatus("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => setCreating(true)}>
                      <Plus size={14} /> Add customer
                    </Button>
                  )
                }
              />
            )}
          </Card>
        </>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={closeAccount}
        title={selected ? selected.name : "Customer account"}
        description={selected?.email}
        width={640}
        footer={
          <>
            <Button variant="secondary" onClick={closeAccount} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="edit-customer-form" loading={saving} disabled={!editForm}>
              <ShieldCheck size={15} /> Save changes
            </Button>
          </>
        }
      >
        {detailLoading ? (
          <Spinner label="Loading account details…" />
        ) : editForm ? (
          <div className="form-stack">
            {detail ? (
              <>
                <div className="agent-stats">
                  <div className="agent-stat">
                    <b>{detail.openCount}</b>
                    <span>Open requests</span>
                  </div>
                  <div className="agent-stat">
                    <b>{detail.resolvedCount}</b>
                    <span>Resolved</span>
                  </div>
                  <div className="agent-stat">
                    <b>{detail.conversationCount}</b>
                    <span>Assistant chats</span>
                  </div>
                  <div className="agent-stat">
                    <b>{detail.ticketCount}</b>
                    <span>Requests all time</span>
                  </div>
                </div>

                {detail.tickets.length ? (
                  <div>
                    <p className="label" style={{ marginBottom: 6 }}>
                      Recent requests
                    </p>
                    <div className="customer-account-tickets">
                      {detail.tickets.slice(0, 5).map((ticket) => (
                        <Link
                          key={ticket.id}
                          to={`/admin/requests/${ticket.id}`}
                          className="customer-account-ticket"
                        >
                          <div style={{ minWidth: 0 }}>
                            <div className="cell-title">
                              <span className="row-ref">{ticket.ref}</span> {ticket.subject}
                            </div>
                            <div className="cell-sub">
                              {ticket.status.replace("_", " ")} · updated {relativeTime(ticket.updatedAt)}
                            </div>
                          </div>
                          <ArrowUpRight size={14} />
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="small muted">This customer has not created any requests yet.</p>
                )}

                <p className="small muted">
                  Member since {new Date(detail.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                  {detail.lastActivityAt ? ` · last activity ${relativeTime(detail.lastActivityAt)}` : ""}
                </p>
              </>
            ) : null}

            <form id="edit-customer-form" className="form-stack" onSubmit={saveAccount}>
              <Field label="Full name" htmlFor="customer-name">
                <input
                  id="customer-name"
                  className="input"
                  value={editForm.name}
                  onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                  required
                />
              </Field>
              <Field label="Email" htmlFor="customer-email">
                <input
                  id="customer-email"
                  className="input"
                  type="email"
                  value={editForm.email}
                  onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
                  maxLength={254}
                  autoComplete="email"
                  required
                />
              </Field>
              <Field label="Company" htmlFor="customer-company" hint="Optional. Shown on their profile and requests.">
                <input
                  id="customer-company"
                  className="input"
                  value={editForm.company}
                  onChange={(event) => setEditForm({ ...editForm, company: event.target.value })}
                  maxLength={120}
                  autoComplete="organization"
                />
              </Field>
              <Field label="Account status" htmlFor="customer-status">
                <Select
                  id="customer-status"
                  value={editForm.active ? "active" : "inactive"}
                  onChange={(event) => setEditForm({ ...editForm, active: event.target.value === "active" })}
                >
                  <option value="active">Active — can sign in and open requests</option>
                  <option value="inactive">Deactivated — blocked and signed out</option>
                </Select>
              </Field>
              <Field
                label="Reset password"
                htmlFor="customer-password"
                hint="Leave empty to keep the current password. Use 8 to 128 characters."
              >
                <input
                  id="customer-password"
                  className="input"
                  type="password"
                  value={editForm.password}
                  onChange={(event) => setEditForm({ ...editForm, password: event.target.value })}
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder="New password (optional)"
                />
              </Field>
              {editError ? <ErrorNote message={editError} /> : null}
            </form>
          </div>
        ) : editError ? (
          <ErrorNote message={editError} />
        ) : null}
      </Modal>

      <Modal
        open={creating}
        onClose={() => {
          if (!saving) setCreating(false);
        }}
        title="Add customer account"
        description="Create a customer login. Share the initial password through an approved secure channel."
        width={520}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="new-customer-form" loading={saving}>
              <UserPlus size={15} /> Create account
            </Button>
          </>
        }
      >
        <form id="new-customer-form" className="form-stack" onSubmit={createAccount}>
          <Field label="Full name" htmlFor="new-customer-name">
            <input
              id="new-customer-name"
              className="input"
              value={createForm.name}
              onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
              minLength={2}
              maxLength={80}
              autoComplete="name"
              required
            />
          </Field>
          <Field label="Email" htmlFor="new-customer-email">
            <input
              id="new-customer-email"
              className="input"
              type="email"
              value={createForm.email}
              onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
              maxLength={254}
              autoComplete="email"
              required
            />
          </Field>
          <Field label="Company" htmlFor="new-customer-company" hint="Optional.">
            <input
              id="new-customer-company"
              className="input"
              value={createForm.company}
              onChange={(event) => setCreateForm({ ...createForm, company: event.target.value })}
              maxLength={120}
              autoComplete="organization"
            />
          </Field>
          <Field label="Initial password" htmlFor="new-customer-password" hint="Use 8 to 128 characters.">
            <input
              id="new-customer-password"
              className="input"
              type="password"
              value={createForm.password}
              onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })}
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </Field>
          {createError ? <ErrorNote message={createError} /> : null}
        </form>
      </Modal>
    </>
  );
}
