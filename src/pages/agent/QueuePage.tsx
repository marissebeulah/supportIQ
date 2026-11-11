import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlarmClock, CheckCircle, Flag, Inbox, LayoutDashboard, RefreshCw, Search, TriangleAlert, UserCheck } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { api } from "../../lib/api";
import { useApi, useRealtime, useTitle } from "../../lib/hooks";
import { PRIORITY_META, STATUS_META, STATUS_ORDER } from "../../lib/format";
import type { Priority, Product, Status, TicketListResponse, TicketSummary } from "../../lib/types";
import { AnimatedNumber, Button, Card, EmptyState, PageHead, PaginatedList, Select, SkeletonRows } from "../../components/ui";
import { StaffTicketTable } from "../../components/StaffTicketTable";

type QueueScope = "queue" | "mine" | "resolved";

const COPY: Record<QueueScope, { title: string; description: string; emptyTitle: string; emptyBody: string }> = {
  queue: {
    title: "Support queue",
    description: "Open requests assigned to you, with priority and service targets in view.",
    emptyTitle: "No open requests assigned to you",
    emptyBody: "Requests assigned by an admin will appear here.",
  },
  mine: {
    title: "My requests",
    description: "Requests assigned to you. Keep the customer updated until the issue is fully resolved.",
    emptyTitle: "Nothing assigned to you",
    emptyBody: "Requests assigned by an admin will appear here.",
  },
  resolved: {
    title: "Resolved requests",
    description: "Completed work with resolution outcomes and customer ratings.",
    emptyTitle: "No resolved requests yet",
    emptyBody: "Requests you resolve or close will collect here for reference.",
  },
};

export default function AgentQueuePage({ scope }: { scope: QueueScope }) {
  useTitle(COPY[scope].title);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [priority, setPriority] = useState<"all" | Priority>("all");
  const [productId, setProductId] = useState(params.get("productId") ?? "all");
  const [lateOnly, setLateOnly] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const ticketsQuery = useApi<TicketListResponse>(() => api.get<TicketListResponse>("/api/tickets?limit=all"));
  const productsQuery = useApi<{ products: Product[] }>(() => api.get<{ products: Product[] }>("/api/ticket-products"));
  useRealtime(() => ticketsQuery.reload());

  const all = ticketsQuery.data?.tickets ?? [];
  const open = all.filter((ticket) => ticket.status !== "resolved" && ticket.status !== "closed");
  const mine = all.filter((ticket) => ticket.assignee?.id === user?.id);
  const resolved = all.filter((ticket) => ticket.status === "resolved" || ticket.status === "closed");
  const late = all.filter((ticket) => ticket.isLate);

  const base = scope === "queue" ? open : scope === "mine" ? mine : resolved;

  const availableStatuses = useMemo(
    () => STATUS_ORDER.filter((value) => base.some((ticket) => ticket.status === value)),
    [base],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return base
      .filter((ticket) => status === "all" || ticket.status === status)
      .filter((ticket) => priority === "all" || ticket.priority === priority)
      .filter((ticket) => productId === "all" || (productId === "none" ? !ticket.product : ticket.product?.id === Number(productId)))
      .filter((ticket) => !lateOnly || ticket.isLate)
      .filter((ticket) => !flaggedOnly || ticket.isFlagged || ticket.flaggedCount > 0)
      .filter((ticket) => {
        if (!term) return true;
        return [ticket.subject, ticket.ref, ticket.customer.name, ticket.customer.company ?? "", ticket.assignee?.name ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(term);
      });
  }, [base, status, priority, productId, lateOnly, flaggedOnly, search]);

  const openTicket = (ticket: TicketSummary) => navigate(`/agent/tickets/${ticket.id}`);
  const resetFilters = () => {
    setSearch("");
    setStatus("all");
    setPriority("all");
    setProductId("all");
    setLateOnly(false);
    setFlaggedOnly(false);
  };

  return (
    <>
      <PageHead
        eyebrow="IT support portal"
        title={COPY[scope].title}
        description={COPY[scope].description}
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Link to="/agent/reports" className="btn btn-secondary btn-md">
              <LayoutDashboard size={15} /> My reports
            </Link>
            <Button variant="secondary" onClick={() => ticketsQuery.reload()} loading={ticketsQuery.loading}>
              <RefreshCw size={15} /> Refresh
            </Button>
          </div>
        }
      />

      <div className="stat-grid">
        <div className="stat is-accent">
          <span className="stat-icon">
            <Inbox size={17} />
          </span>
          <p className="stat-label">Open requests</p>
          <p className="stat-value"><AnimatedNumber value={open.length} /></p>
          <p className="stat-sub">Active tickets requiring action</p>
        </div>
        <div className="stat">
          <span className="stat-icon">
            <CheckCircle size={17} />
          </span>
          <p className="stat-label">Resolved</p>
          <p className="stat-value"><AnimatedNumber value={resolved.length} /></p>
          <p className="stat-sub">Completed in your history</p>
        </div>
        <div className={`stat ${late.length ? "is-danger" : ""}`}>
          <span className="stat-icon">
            <AlarmClock size={17} />
          </span>
          <p className="stat-label">Late / at risk</p>
          <p className="stat-value"><AnimatedNumber value={late.length} /></p>
          <p className="stat-sub">On your assigned requests</p>
        </div>
        <div className="stat">
          <span className="stat-icon">
            <UserCheck size={17} />
          </span>
          <p className="stat-label">Waiting on customer</p>
          <p className="stat-value"><AnimatedNumber value={open.filter((ticket) => ticket.status === "waiting_customer").length} /></p>
          <p className="stat-sub">Follow-ups outstanding</p>
        </div>
      </div>

      <div className="filters">
        <div className="search">
          <Search size={15} />
          <input
            className="input"
            type="search"
            placeholder="Search by subject, reference, customer…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search requests"
          />
        </div>
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value as "all" | Status)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {availableStatuses.map((value) => (
            <option key={value} value={value}>
              {STATUS_META[value].label}
            </option>
          ))}
        </Select>
        <Select
          value={priority}
          onChange={(event) => setPriority(event.target.value as "all" | Priority)}
          aria-label="Filter by priority"
        >
          <option value="all">All priorities</option>
          {(Object.keys(PRIORITY_META) as Priority[]).map((value) => (
            <option key={value} value={value}>
              {PRIORITY_META[value].label}
            </option>
          ))}
        </Select>
        <Select value={productId} onChange={(event) => setProductId(event.target.value)} aria-label="Filter by product">
          <option value="all">All products</option>
          <option value="none">No product selected</option>
          {(productsQuery.data?.products ?? []).map((product) => (
            <option key={product.id} value={product.id}>{product.name}</option>
          ))}
        </Select>
        <button
          type="button"
          className={`chip ${lateOnly ? "is-active" : ""}`.trim()}
          onClick={() => setLateOnly((current) => !current)}
          aria-pressed={lateOnly}
        >
          <TriangleAlert size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          Late only
        </button>
        <button
          type="button"
          className={`chip ${flaggedOnly ? "is-active" : ""}`.trim()}
          onClick={() => setFlaggedOnly((current) => !current)}
          aria-pressed={flaggedOnly}
        >
          <Flag size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          Flagged
        </button>
        {search || status !== "all" || priority !== "all" || lateOnly || flaggedOnly ? (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Clear
          </Button>
        ) : null}
        <span className="small muted" style={{ marginLeft: "auto" }}>
          {filtered.length} of {base.length}
        </span>
      </div>

      <Card>
        {ticketsQuery.loading && !ticketsQuery.data ? (
          <SkeletonRows rows={6} />
        ) : (
          <PaginatedList items={filtered} label="requests">
            {(pageItems) => (
              <StaffTicketTable
                tickets={pageItems}
                onOpen={openTicket}
                empty={
                  <EmptyState
                    icon={Inbox}
                    title={search || lateOnly || flaggedOnly || status !== "all" || priority !== "all" ? "No matching requests" : COPY[scope].emptyTitle}
                    body={
                      search || lateOnly || flaggedOnly || status !== "all" || priority !== "all"
                        ? "Try a different filter or clear the search."
                        : COPY[scope].emptyBody
                    }
                    action={
                      search || lateOnly || flaggedOnly || status !== "all" || priority !== "all" ? (
                        <Button variant="secondary" size="sm" onClick={resetFilters}>
                          Clear filters
                        </Button>
                      ) : undefined
                    }
                  />
                }
              />
            )}
          </PaginatedList>
        )}
      </Card>
    </>
  );
}
