import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  CheckCircle,
  KeyRound,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Ticket,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import { api, errorMessage } from "../../lib/api";
import { useApi, useRealtime, useTitle } from "../../lib/hooks";
import { formatMinutes, relativeTime } from "../../lib/format";
import type { AdminAgent, AdminCustomerAccount, AdminCustomerDetail, PasswordResetRequest } from "../../lib/types";
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

// ---- types ----

type Tab = "it" | "customers";

type NewAgentForm = { name: string; email: string; title: string; password: string };
const EMPTY_AGENT_FORM: NewAgentForm = { name: "", email: "", title: "", password: "" };

type ResetForm = { password: string; confirm: string };
const EMPTY_RESET_FORM: ResetForm = { password: "", confirm: "" };

type CustomerEditForm = {
  name: string;
  email: string;
  company: string;
  active: boolean;
  password: string;
};

type CustomerCreateForm = {
  name: string;
  email: string;
  company: string;
  password: string;
};

const EMPTY_CREATE: CustomerCreateForm = { name: "", email: "", company: "", password: "" };

// ---- component ----

export default function AccountsPage() {
  useTitle("Accounts");
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("it");

  // ---- IT staff data ----
  const teamQuery = useApi<{ agents: AdminAgent[] }>(() =>
    api.get<{ agents: AdminAgent[] }>("/api/admin/team"),
  );

  // ---- Customers data ----
  const customersQuery = useApi<{ customers: AdminCustomerAccount[] }>(() =>
    api.get<{ customers: AdminCustomerAccount[] }>("/api/admin/customers?includeInactive=1"),
  );

  // ---- Pending resets ----
  const resetsQuery = useApi<{ pending: PasswordResetRequest[] }>(() =>
    api.get<{ pending: PasswordResetRequest[] }>("/api/admin/password-resets"),
  );

  useRealtime(() => {
    teamQuery.reload();
    customersQuery.reload();
    resetsQuery.reload();
  });

  const agents = teamQuery.data?.agents ?? [];
  const customers = customersQuery.data?.customers ?? [];
  const pendingResets = resetsQuery.data?.pending ?? [];

  // ---- IT: Add member modal ----
  const [adding, setAdding] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addForm, setAddForm] = useState<NewAgentForm>(EMPTY_AGENT_FORM);
  const [addError, setAddError] = useState<string | null>(null);

  const updateAddField = (field: keyof NewAgentForm, value: string) => {
    setAddForm((f) => ({ ...f, [field]: value }));
  };

  const createAgent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (addSaving) return;
    setAddSaving(true);
    setAddError(null);
    try {
      const response = await api.post<{ agent: { name: string } }>("/api/admin/team", {
        name: addForm.name.trim(),
        email: addForm.email.trim(),
        title: addForm.title.trim(),
        password: addForm.password,
      });
      setAdding(false);
      setAddForm(EMPTY_AGENT_FORM);
      teamQuery.reload();
      toast(`${response.agent.name} added to the IT team.`);
    } catch (error) {
      setAddError(errorMessage(error));
    } finally {
      setAddSaving(false);
    }
  };

  // ---- IT: Reset password modal ----
  const [resetTarget, setResetTarget] = useState<AdminAgent | null>(null);
  const [resetForm, setResetForm] = useState<ResetForm>(EMPTY_RESET_FORM);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSaving, setResetSaving] = useState(false);

  const openReset = (agent: AdminAgent) => {
    setResetTarget(agent);
    setResetForm(EMPTY_RESET_FORM);
    setResetError(null);
  };

  const closeReset = () => {
    if (resetSaving) return;
    setResetTarget(null);
    setResetForm(EMPTY_RESET_FORM);
    setResetError(null);
  };

  const submitReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetTarget || resetSaving) return;
    if (resetForm.password.length < 8 || resetForm.password.length > 128) {
      setResetError("Use a password between 8 and 128 characters.");
      return;
    }
    if (resetForm.password !== resetForm.confirm) {
      setResetError("Passwords do not match.");
      return;
    }
    setResetSaving(true);
    setResetError(null);
    try {
      await api.patch(`/api/admin/team/${resetTarget.id}`, { password: resetForm.password });
      // Clear any pending resets for this user
      await api.del(`/api/admin/password-resets/${resetTarget.id}`).catch(() => null);
      resetsQuery.reload();
      toast(`Password reset for ${resetTarget.name}. They have been signed out.`, "info");
      closeReset();
    } catch (error) {
      setResetError(errorMessage(error));
    } finally {
      setResetSaving(false);
    }
  };

  // ---- Customers ----
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");

  const [selected, setSelected] = useState<AdminCustomerAccount | null>(null);
  const [detail, setDetail] = useState<AdminCustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editForm, setEditForm] = useState<CustomerEditForm | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<CustomerCreateForm>(EMPTY_CREATE);
  const [createError, setCreateError] = useState<string | null>(null);

  const customerStats = useMemo(() => {
    const active = customers.filter((c) => c.active).length;
    const withOpen = customers.filter((c) => c.openCount > 0).length;
    const companies = new Set(
      customers.map((c) => c.company?.trim().toLowerCase()).filter(Boolean),
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
      // If password was reset, clear pending resets for this user
      if (editForm.password) {
        await api.del(`/api/admin/password-resets/${selected.id}`).catch(() => null);
        resetsQuery.reload();
      }
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

  const loading = tab === "it" ? (teamQuery.loading && !teamQuery.data) : (customersQuery.loading && !customersQuery.data);

  return (
    <>
      <PageHead
        eyebrow="Admin monitoring"
        title="Accounts"
        description="Manage IT staff accounts and customer accounts in one place."
        actions={
          <>
            {tab === "it" ? (
              <Button onClick={() => { setAddError(null); setAdding(true); }}>
                <UserPlus size={15} /> Add IT member
              </Button>
            ) : (
              <Button onClick={() => { setCreateForm(EMPTY_CREATE); setCreateError(null); setCreating(true); }}>
                <UserPlus size={15} /> Add customer
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => { teamQuery.reload(); customersQuery.reload(); resetsQuery.reload(); }}
              loading={teamQuery.loading || customersQuery.loading}
            >
              <RefreshCw size={15} /> Refresh
            </Button>
          </>
        }
      />

      {/* Pending resets banner */}
          {pendingResets.length > 0 ? (
        <div
          className="banner"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            marginBottom: 16,
            background: "var(--color-warn-bg, #fffbeb)",
            border: "1px solid var(--color-warn-border, #fcd34d)",
            borderRadius: 8,
            color: "var(--color-warn-text, #92400e)",
            fontSize: "0.875rem",
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>
            <strong>{pendingResets.length} pending password reset{pendingResets.length !== 1 ? "s" : ""}</strong>
            {" — "}
            {pendingResets.map((r) => r.name).join(", ")} requested access recovery. Reset their password manually below.
          </span>
        </div>
      ) : null}

      {/* Tabs */}
      <div className="tabs" role="tablist" aria-label="Account type" style={{ marginBottom: 20 }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "it"}
          className={`tab-btn ${tab === "it" ? "is-active" : ""}`.trim()}
          onClick={() => setTab("it")}
        >
          <Users size={15} /> IT staff
          <span className="tab-count">{teamQuery.data ? agents.length : "–"}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "customers"}
          className={`tab-btn ${tab === "customers" ? "is-active" : ""}`.trim()}
          onClick={() => setTab("customers")}
        >
          <UserPlus size={15} /> Customers
          <span className="tab-count">{customersQuery.data ? customers.length : "–"}</span>
        </button>
      </div>

      {/* ---- IT STAFF TAB ---- */}
      {tab === "it" && (
        loading ? (
          <Spinner label="Loading team…" />
        ) : agents.length ? (
          <PaginatedList items={agents} label="team members">
            {(pageItems) => (
              <Card>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Open assigned</th>
                        <th>Resolved · 30d</th>
                        <th>Avg first reply</th>
                        <th>CSAT</th>
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((agent) => {
                        const hasPendingReset = pendingResets.some((r) => r.user_id === agent.id);
                        return (
                          <tr key={agent.id}>
                            <td>
                              <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                                <Avatar name={agent.name} size="sm" />
                                <div style={{ minWidth: 0 }}>
                                  <div className="cell-title">
                                    {agent.name}
                                    {hasPendingReset ? (
                                      <span className="badge badge-warn" style={{ marginLeft: 6, verticalAlign: "middle" }}>
                                        reset requested
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="cell-sub">{agent.email}</div>
                                  {agent.title ? <div className="cell-sub">{agent.title}</div> : null}
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className={agent.lateAssigned > 0 ? "badge badge-late" : ""}>
                                {agent.openAssigned}
                                {agent.lateAssigned > 0 ? ` (${agent.lateAssigned} late)` : ""}
                              </span>
                            </td>
                            <td>{agent.resolved30d}</td>
                            <td>{formatMinutes(agent.avgFirstResponseMinutes)}</td>
                            <td>{agent.avgCsat === null ? "—" : agent.avgCsat.toFixed(1)}</td>
                            <td>
                              <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                                <Link to={`/admin/messages?userId=${agent.id}`} className="btn btn-secondary btn-sm">
                                  <MessageSquare size={13} /> Message
                                </Link>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openReset(agent)}
                                >
                                  <KeyRound size={13} /> Reset password
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </PaginatedList>
        ) : (
          <Card>
            <EmptyState
              icon={Users}
              title="No IT staff yet"
              body="Add IT team members to manage their accounts and reset passwords."
              action={
                <Button size="sm" onClick={() => { setAddError(null); setAdding(true); }}>
                  <Plus size={14} /> Add IT member
                </Button>
              }
            />
          </Card>
        )
      )}

      {/* ---- CUSTOMERS TAB ---- */}
      {tab === "customers" && (
        loading ? (
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
                <p className="stat-value"><AnimatedNumber value={customerStats.total} /></p>
                <p className="stat-sub">{customerStats.active} active</p>
              </div>
              <div className={`stat ${customerStats.total - customerStats.active ? "is-warn" : ""}`}>
                <span className="stat-icon">
                  <UserX size={17} />
                </span>
                <p className="stat-label">Deactivated</p>
                <p className="stat-value"><AnimatedNumber value={customerStats.total - customerStats.active} /></p>
                <p className="stat-sub">
                  {customerStats.total - customerStats.active ? "Signed out and blocked" : "All accounts active"}
                </p>
              </div>
              <div className="stat">
                <span className="stat-icon">
                  <Ticket size={17} />
                </span>
                <p className="stat-label">With open requests</p>
                <p className="stat-value"><AnimatedNumber value={customerStats.withOpen} /></p>
                <p className="stat-sub">Customers waiting on IT</p>
              </div>
              <div className="stat">
                <span className="stat-icon">
                  <Building2 size={17} />
                </span>
                <p className="stat-label">Companies</p>
                <p className="stat-value"><AnimatedNumber value={customerStats.companies} /></p>
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
                  onClick={() => { setSearch(""); setStatus("all"); }}
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
                                    <div className="cell-title">
                                      {customer.name}
                                      {pendingResets.some((r) => r.user_id === customer.id) ? (
                                        <span className="badge badge-warn" style={{ marginLeft: 6, verticalAlign: "middle" }}>
                                          reset requested
                                        </span>
                                      ) : null}
                                    </div>
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
                        onClick={() => { setSearch(""); setStatus("all"); }}
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
        )
      )}

      {/* ---- IT: Add member modal ---- */}
      <Modal
        open={adding}
        onClose={() => { if (!addSaving) setAdding(false); }}
        title="Add IT member"
        description="Create an active IT account. Share the initial password with the teammate through an approved secure channel."
        width={500}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)} disabled={addSaving}>Cancel</Button>
            <Button type="submit" form="new-it-member-form" loading={addSaving}>
              <UserPlus size={15} /> Create account
            </Button>
          </>
        }
      >
        <form id="new-it-member-form" className="form-stack" onSubmit={createAgent}>
          <Field label="Full name" htmlFor="new-agent-name">
            <input id="new-agent-name" className="input" value={addForm.name} onChange={(e) => updateAddField("name", e.target.value)} minLength={2} maxLength={80} autoComplete="name" required />
          </Field>
          <Field label="Work email" htmlFor="new-agent-email">
            <input id="new-agent-email" className="input" type="email" value={addForm.email} onChange={(e) => updateAddField("email", e.target.value)} maxLength={254} autoComplete="email" required />
          </Field>
          <Field label="Job title" htmlFor="new-agent-title">
            <input id="new-agent-title" className="input" value={addForm.title} onChange={(e) => updateAddField("title", e.target.value)} maxLength={120} autoComplete="organization-title" />
          </Field>
          <Field label="Initial password" hint="Use 8 to 128 characters." htmlFor="new-agent-password">
            <input id="new-agent-password" className="input" type="password" value={addForm.password} onChange={(e) => updateAddField("password", e.target.value)} minLength={8} maxLength={128} autoComplete="new-password" required />
          </Field>
          {addError ? <ErrorNote message={addError} /> : null}
        </form>
      </Modal>

      {/* ---- IT: Reset password modal ---- */}
      <Modal
        open={Boolean(resetTarget)}
        onClose={closeReset}
        title={resetTarget ? `Reset password — ${resetTarget.name}` : "Reset password"}
        description={resetTarget?.email}
        width={460}
        footer={
          <>
            <Button variant="secondary" onClick={closeReset} disabled={resetSaving}>Cancel</Button>
            <Button type="submit" form="it-reset-password-form" loading={resetSaving}>
              <KeyRound size={15} /> Reset password
            </Button>
          </>
        }
      >
        <form id="it-reset-password-form" className="form-stack" onSubmit={submitReset}>
          <Field label="New password" htmlFor="it-new-password" hint="Use 8 to 128 characters.">
            <input
              id="it-new-password"
              className="input"
              type="password"
              value={resetForm.password}
              onChange={(e) => setResetForm((f) => ({ ...f, password: e.target.value }))}
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </Field>
          <Field label="Confirm password" htmlFor="it-confirm-password">
            <input
              id="it-confirm-password"
              className="input"
              type="password"
              value={resetForm.confirm}
              onChange={(e) => setResetForm((f) => ({ ...f, confirm: e.target.value }))}
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </Field>
          {resetError ? <ErrorNote message={resetError} /> : null}
        </form>
      </Modal>

      {/* ---- Customer: Edit modal ---- */}
      <Modal
        open={Boolean(selected)}
        onClose={closeAccount}
        title={selected ? selected.name : "Customer account"}
        description={selected?.email}
        width={640}
        footer={
          <>
            <Button variant="secondary" onClick={closeAccount} disabled={saving}>Cancel</Button>
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
                    <p className="label" style={{ marginBottom: 6 }}>Recent requests</p>
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
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
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
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
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
                  onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                  maxLength={120}
                  autoComplete="organization"
                />
              </Field>
              <Field label="Account status" htmlFor="customer-status">
                <Select
                  id="customer-status"
                  value={editForm.active ? "active" : "inactive"}
                  onChange={(e) => setEditForm({ ...editForm, active: e.target.value === "active" })}
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
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
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

      {/* ---- Customer: Create modal ---- */}
      <Modal
        open={creating}
        onClose={() => { if (!saving) setCreating(false); }}
        title="Add customer account"
        description="Create a customer login. Share the initial password through an approved secure channel."
        width={520}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)} disabled={saving}>Cancel</Button>
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
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
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
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
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
              onChange={(e) => setCreateForm({ ...createForm, company: e.target.value })}
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
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
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
