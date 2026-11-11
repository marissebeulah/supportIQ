import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Flag, Plus, RefreshCw, Search, Ticket, TriangleAlert, Users } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { api } from "../../lib/api";
import { useApi, useRealtime, useTitle } from "../../lib/hooks";
import { PRIORITY_META, STATUS_META, STATUS_ORDER } from "../../lib/format";
import type { Priority, Product, Status, TicketListResponse, TicketSummary } from "../../lib/types";
import { AnimatedNumber, Button, Card, EmptyState, PageHead, PaginatedList, Select, SkeletonRows } from "../../components/ui";
import { StaffTicketTable } from "../../components/StaffTicketTable";

export default function AdminRequestsPage() {
  useTitle("All requests");
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [search, setSearch] = useState(params.get("q") ?? "");
  const [assignee, setAssignee] = useState(params.get("assignee") ?? "all");
  const [status, setStatus] = useState<Status | "all">("all");
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [productId, setProductId] = useState(params.get("productId") ?? "all");
  const [lateOnly, setLateOnly] = useState(params.get("late") === "1");
  const [flaggedOnly, setFlaggedOnly] = useState(params.get("flagged") === "1");

  const ticketsQuery = useApi<TicketListResponse>(() => api.get<TicketListResponse>("/api/tickets?limit=all"));
  const productsQuery = useApi<{ products: Product[] }>(() => api.get<{ products: Product[] }>("/api/ticket-products"));
  useRealtime(() => ticketsQuery.reload());

  const all = ticketsQuery.data?.tickets ?? [];
  const open = all.filter((ticket) => ticket.status !== "resolved" && ticket.status !== "closed");
  const late = all.filter((ticket) => ticket.isLate);

  const assignees = useMemo(() => {
    const seen = new Map<number, string>();
    for (const ticket of all) {
      if (ticket.assignee) seen.set(ticket.assignee.id, ticket.assignee.name);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all
      .filter((ticket) => {
        if (assignee === "unassigned") return !ticket.assignee;
        if (assignee === "me") return ticket.assignee?.id === user?.id;
        if (assignee !== "all") return ticket.assignee?.id === Number(assignee);
        return true;
      })
      .filter((ticket) => status === "all" || ticket.status === status)
      .filter((ticket) => priority === "all" || ticket.priority === priority)
      .filter((ticket) => productId === "all" || (productId === "none" ? !ticket.product : ticket.product?.id === Number(productId)))
      .filter((ticket) => !lateOnly || ticket.isLate)
      .filter((ticket) => !flaggedOnly || ticket.isFlagged || ticket.flaggedCount > 0)
      .filter((ticket) => {
        if (!term) return true;
        return [
          ticket.subject,
          ticket.ref,
          ticket.customer.name,
          ticket.customer.company ?? "",
          ticket.assignee?.name ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(term);
      });
  }, [all, assignee, status, priority, productId, lateOnly, flaggedOnly, search, user?.id]);

  const openTicket = (ticket: TicketSummary) => navigate(`/admin/requests/${ticket.id}`);
  const hasFilters =
    Boolean(search) || assignee !== "all" || status !== "all" || priority !== "all" || productId !== "all" || lateOnly || flaggedOnly;

  const reset = () => {
    setSearch("");
    setAssignee("all");
    setStatus("all");
    setPriority("all");
    setProductId("all");
    setLateOnly(false);
    setFlaggedOnly(false);
  };

  return (
    <>
      <PageHead
        eyebrow="Admin monitoring"
        title="All requests"
        description="Every conversation in the organization. Reassign ownership, step into a thread, or check service targets."
        actions={
          <>
            <Button onClick={() => navigate("/admin/requests/new")}>
              <Plus size={15} /> Create on behalf
            </Button>
            <Button variant="secondary" onClick={() => ticketsQuery.reload()} loading={ticketsQuery.loading}>
              <RefreshCw size={15} /> Refresh
            </Button>
          </>
        }
      />

      <div className="stat-grid">
        <div className="stat is-accent">
          <p className="stat-label">Open requests</p>
          <p className="stat-value"><AnimatedNumber value={open.length} /></p>
          <p className="stat-sub">of {all.length} total</p>
        </div>
        <div className={`stat ${open.filter((ticket) => !ticket.assignee).length ? "is-warn" : ""}`}>
          <span className="stat-icon">
            <Users size={17} />
          </span>
          <p className="stat-label">Unassigned</p>
          <p className="stat-value"><AnimatedNumber value={open.filter((ticket) => !ticket.assignee).length} /></p>
          <p className="stat-sub">Open without an owner</p>
        </div>
        <div className={`stat ${late.length ? "is-danger" : ""}`}>
          <span className="stat-icon">
            <TriangleAlert size={17} />
          </span>
          <p className="stat-label">Late / at risk</p>
          <p className="stat-value"><AnimatedNumber value={late.length} /></p>
          <p className="stat-sub">Past response or resolution target</p>
        </div>
        <div className="stat">
          <span className="stat-icon">
            <Ticket size={17} />
          </span>
          <p className="stat-label">Resolved</p>
          <p className="stat-value"><AnimatedNumber value={all.filter((ticket) => ticket.status === "resolved" || ticket.status === "closed").length} /></p>
          <p className="stat-sub">Resolved or closed</p>
        </div>
      </div>

      <div className="filters">
        <div className="search">
          <Search size={15} />
          <input
            className="input"
            type="search"
            placeholder="Search subject, reference, customer…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search all requests"
          />
        </div>
        <Select value={status} onChange={(event) => setStatus(event.target.value as Status | "all")} aria-label="Filter by status">
          <option value="all">All statuses</option>
          {STATUS_ORDER.map((value) => (
            <option key={value} value={value}>
              {STATUS_META[value].label}
            </option>
          ))}
        </Select>
        <Select
          value={priority}
          onChange={(event) => setPriority(event.target.value as Priority | "all")}
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
        <Select value={assignee} onChange={(event) => setAssignee(event.target.value)} aria-label="Filter by assignee">
          <option value="all">All agents</option>
          <option value="unassigned">Unassigned</option>
          <option value="me">Assigned to me</option>
          {assignees.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        <button
          type="button"
          className={`chip ${lateOnly ? "is-active" : ""}`.trim()}
          onClick={() => setLateOnly((current) => !current)}
          aria-pressed={lateOnly}
        >
          <TriangleAlert size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} /> Late only
        </button>
        <button
          type="button"
          className={`chip ${flaggedOnly ? "is-active" : ""}`.trim()}
          onClick={() => setFlaggedOnly((current) => !current)}
          aria-pressed={flaggedOnly}
        >
          <Flag size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} /> Flagged
        </button>
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={reset}>
            Clear
          </Button>
        ) : null}
        <span className="small muted" style={{ marginLeft: "auto" }}>
          {filtered.length} of {all.length}
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
                showRating
                empty={
                  <EmptyState
                    icon={Ticket}
                    title={hasFilters ? "No matching requests" : "No requests yet"}
                    body={
                      hasFilters
                        ? "Adjust the filters or clear the search to see more."
                        : "Customer requests will appear here as soon as they are created."
                    }
                    action={
                      hasFilters ? (
                        <Button variant="secondary" size="sm" onClick={reset}>
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
