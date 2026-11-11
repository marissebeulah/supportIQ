import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { MessagesSquare, Plus, Search } from "lucide-react";
import { api } from "../../lib/api";
import { useApi, useRealtime, useTitle } from "../../lib/hooks";
import type { Product, TicketListResponse, TicketSummary } from "../../lib/types";
import { Button, Card, EmptyState, PageHead, PaginatedList, Segmented, Select, SkeletonRows } from "../../components/ui";
import { CustomerTicketRow } from "../../components/CustomerTicketRow";

type Filter = "all" | "active" | "waiting" | "resolved";

export default function CustomerRequestsPage() {
  useTitle("My requests");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const initialFilter = (params.get("filter") as Filter | null) ?? "all";
  const [filter, setFilter] = useState<Filter>(
    ["all", "active", "waiting", "resolved"].includes(initialFilter) ? initialFilter : "all",
  );
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("all");

  const ticketsQuery = useApi<TicketListResponse>(() => api.get<TicketListResponse>("/api/tickets?limit=all"));
  const productsQuery = useApi<{ products: Product[] }>(() => api.get<{ products: Product[] }>("/api/bot/products"));
  useRealtime(() => ticketsQuery.reload());

  const all = ticketsQuery.data?.tickets ?? [];
  const active = all.filter((ticket) => ticket.status !== "resolved" && ticket.status !== "closed");
  const waiting = all.filter((ticket) => ticket.status === "waiting_customer");
  const resolved = all.filter((ticket) => ticket.status === "resolved" || ticket.status === "closed");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all
      .filter((ticket) => {
        if (filter === "active") return ticket.status !== "resolved" && ticket.status !== "closed";
        if (filter === "waiting") return ticket.status === "waiting_customer";
        if (filter === "resolved") return ticket.status === "resolved" || ticket.status === "closed";
        return true;
      })
      .filter((ticket) => productId === "all" || (productId === "none" ? !ticket.product : ticket.product?.id === Number(productId)))
      .filter((ticket) => {
        if (!term) return true;
        return [
          ticket.subject,
          ticket.ref,
          ticket.category,
          ticket.product?.name ?? "",
          ticket.assignee?.name ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(term);
      });
  }, [all, filter, productId, search]);

  const hasFilters = Boolean(search) || productId !== "all";

  const clearFilters = () => {
    setSearch("");
    setProductId("all");
  };

  const changeFilter = (next: Filter) => {
    setFilter(next);
    const updated = new URLSearchParams(params);
    if (next === "all") updated.delete("filter");
    else updated.set("filter", next);
    setParams(updated, { replace: true });
  };

  const openTicket = (ticket: TicketSummary) => navigate(`/portal/requests/${ticket.id}`);

  const emptyCopy: Record<Filter, { title: string; body: string }> = {
    all: { title: "No requests yet", body: "When you ask for help, every update and reply will appear here." },
    active: { title: "No active requests", body: "Everything is resolved. Open a new request whenever you need the team." },
    waiting: { title: "Nothing waiting on you", body: "IT has everything they need from you right now." },
    resolved: { title: "No resolved requests yet", body: "Resolved and closed requests will collect here for your reference." },
  };

  return (
    <>
      <PageHead
        eyebrow="Customer portal"
        title="My requests"
        description="Every conversation with IT in one place — status, screenshots, replies, and outcomes."
        actions={
          <Link to="/portal/requests/new" className="btn btn-primary btn-md">
            <Plus size={15} /> New request
          </Link>
        }
      />

      <div className="filters">
        <Segmented
          ariaLabel="Filter requests"
          value={filter}
          onChange={changeFilter}
          options={[
            { value: "all", label: "All", count: all.length },
            { value: "active", label: "Active", count: active.length },
            { value: "waiting", label: "Waiting on you", count: waiting.length },
            { value: "resolved", label: "Resolved", count: resolved.length },
          ]}
        />
        <div className="search">
          <Search size={15} />
          <input
            className="input"
            type="search"
            placeholder="Search requests…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search requests"
          />
        </div>
        <Select value={productId} onChange={(event) => setProductId(event.target.value)} aria-label="Filter by product">
          <option value="all">All products</option>
          <option value="none">No product selected</option>
          {(productsQuery.data?.products ?? []).map((product) => (
            <option key={product.id} value={product.id}>{product.name}</option>
          ))}
        </Select>
        {productId !== "all" ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        ) : null}
      </div>

      <Card>
        {ticketsQuery.loading && !ticketsQuery.data ? (
          <SkeletonRows rows={6} />
        ) : filtered.length ? (
          <PaginatedList items={filtered} label="requests">
            {(pageItems) => (
              <div className="ticket-rows">
                {pageItems.map((ticket) => (
                  <CustomerTicketRow key={ticket.id} ticket={ticket} onOpen={openTicket} />
                ))}
              </div>
            )}
          </PaginatedList>
        ) : (
          <EmptyState
            icon={MessagesSquare}
            title={emptyCopy[filter].title}
            body={emptyCopy[filter].body}
            action={
              hasFilters ? (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Link to="/portal/requests/new" className="btn btn-primary btn-sm">
                  <Plus size={14} /> Create a request
                </Link>
              )
            }
          />
        )}
      </Card>
    </>
  );
}
