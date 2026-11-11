import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, MessagesSquare, RefreshCw, Search, Sparkles } from "lucide-react";
import { api } from "../../lib/api";
import { useApi, useRealtime, useTitle } from "../../lib/hooks";
import { formatDateTime, formatTime, relativeTime } from "../../lib/format";
import type { AdminConversationDetail, AdminConversationSummary, Product } from "../../lib/types";
import { AnimatedNumber, Avatar, Button, Card, EmptyState, PageHead, PaginatedList, ProductPill, Select, SkeletonRows, Spinner } from "../../components/ui";

type ConversationList = {
  conversations: AdminConversationSummary[];
  stats: { total: number; escalated: number; assisted: number };
};

export default function ConversationsPage() {
  useTitle("Assistant conversations");
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const conversations = useApi<ConversationList>(() => api.get<ConversationList>("/api/admin/conversations?limit=all"));
  const productsQuery = useApi<{ products: Product[] }>(() => api.get<{ products: Product[] }>("/api/ticket-products"));
  useRealtime(() => conversations.reload());
  const detail = useApi<AdminConversationDetail>(
    () => api.get<AdminConversationDetail>(`/api/admin/conversations/${selectedId}`),
    [selectedId],
    { enabled: Boolean(selectedId) },
  );

  const list = conversations.data?.conversations ?? [];
  const stats = conversations.data?.stats;

  useEffect(() => {
    if (selectedId) return;
    if (list.length) setSelectedId(list[0].id);
  }, [list, selectedId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return list
      .filter((conversation) =>
        productId === "all"
          ? true
          : productId === "none"
            ? !conversation.product
            : conversation.product?.id === Number(productId),
      )
      .filter((conversation) => {
        if (!term) return true;
        return [
          conversation.customer.name,
          conversation.customer.company ?? "",
          conversation.customer.email,
          conversation.product?.name ?? "",
          conversation.ticketRef ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(term);
      });
  }, [list, productId, search]);

  return (
    <>
      <PageHead
        eyebrow="Admin monitoring"
        title="Assistant conversations"
        description="Read every support-assistant conversation, including the ones handed to IT. The assistant is support-only."
        actions={
          <Button variant="secondary" onClick={() => conversations.reload()} loading={conversations.loading}>
            <RefreshCw size={15} /> Refresh
          </Button>
        }
      />

      <div className="stat-grid">
        <div className="stat is-accent">
          <p className="stat-label">Conversations</p>
          <p className="stat-value"><AnimatedNumber value={stats?.total ?? 0} /></p>
          <p className="stat-sub">Across all customers</p>
        </div>
        <div className="stat">
          <p className="stat-label">Handed to IT</p>
          <p className="stat-value"><AnimatedNumber value={stats?.escalated ?? 0} /></p>
          <p className="stat-sub">Conversations that became requests</p>
        </div>
        <div className="stat">
          <p className="stat-label">Stayed in chat</p>
          <p className="stat-value"><AnimatedNumber value={stats?.assisted ?? 0} /></p>
          <p className="stat-sub">No request created</p>
        </div>
        <div className="stat">
          <p className="stat-label">Guardrail</p>
          <p className="stat-value" style={{ fontSize: 22, paddingTop: 6 }}>
            Support only
          </p>
          <p className="stat-sub">No sales or promotional replies</p>
        </div>
      </div>

      <div className="filters">
        <div className="search">
          <Search size={15} />
          <input
            className="input"
            type="search"
            placeholder="Search by customer, product, or ticket…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search conversations"
          />
        </div>
        <Select value={productId} onChange={(event) => setProductId(event.target.value)} aria-label="Filter by product">
          <option value="all">All products</option>
          <option value="none">No product selected</option>
          {(productsQuery.data?.products ?? []).map((product) => (
            <option key={product.id} value={product.id}>{product.name}</option>
          ))}
        </Select>
        <span className="small muted" style={{ marginLeft: "auto" }}>
          {filtered.length} of {list.length}
        </span>
      </div>

      <div className="convo-layout">
        <Card>
          {conversations.loading && !conversations.data ? (
            <SkeletonRows rows={5} />
          ) : filtered.length ? (
            <PaginatedList items={filtered} label="conversations">
              {(pageItems) => (
                <div className="convo-list">
                  {pageItems.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={`convo-item ${selectedId === conversation.id ? "is-active" : ""}`.trim()}
                  onClick={() => setSelectedId(conversation.id)}
                >
                  <div className="convo-name">
                    <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                      <Avatar name={conversation.customer.name} size="sm" />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {conversation.customer.name}
                      </span>
                    </span>
                    <span className="muted small" style={{ fontWeight: 400 }}>
                      {relativeTime(conversation.updatedAt)}
                    </span>
                  </div>
                  <p className="convo-preview">
                    {conversation.lastMessage
                      ? `${conversation.lastMessage.role === "customer" ? "Customer" : "Assistant"}: ${conversation.lastMessage.body}`
                      : "No messages yet"}
                  </p>
                  <div className="convo-meta">
                    <span>{conversation.customer.company ?? "Customer"}</span>
                    <ProductPill product={conversation.product} />
                    <span>{conversation.messageCount} messages</span>
                    {conversation.ticketRef ? (
                      <>
                        <span>·</span>
                        <span className="badge badge-bot" style={{ padding: "1px 6px" }}>
                          {conversation.ticketRef}
                        </span>
                      </>
                    ) : null}
                  </div>
                  </button>
                  ))}
                </div>
              )}
            </PaginatedList>
          ) : (
            <EmptyState
              icon={MessagesSquare}
              title={search ? "No matching conversations" : "No assistant conversations yet"}
              body={
                search
                  ? "Try another customer name, email, or ticket reference."
                  : "When customers chat with the support assistant, their conversations appear here."
              }
            />
          )}
        </Card>

        <Card>
          {!selectedId ? (
            <EmptyState
              icon={MessagesSquare}
              title="Select a conversation"
              body="Choose a conversation on the left to read the full transcript and linked request."
            />
          ) : detail.loading && !detail.data ? (
            <Spinner label="Opening transcript…" />
          ) : detail.data ? (
            <>
              <div className="card-head">
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <Avatar name={detail.data.conversation.customer.name} size="md" />
                  <div>
                    <h2 className="card-title">{detail.data.conversation.customer.name}</h2>
                    <p className="card-desc">
                      {detail.data.conversation.customer.company ?? "Customer"} ·{" "}
                      {detail.data.conversation.customer.email} · started{" "}
                      {formatDateTime(detail.data.conversation.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="card-head-action" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <ProductPill product={detail.data.conversation.product} />
                  {detail.data.conversation.escalatedTicketId ? (
                    <Link
                      to={`/admin/requests/${detail.data.conversation.escalatedTicketId}`}
                      className="btn btn-secondary btn-sm"
                    >
                      Open {detail.data.conversation.ticketRef}
                      <ArrowUpRight size={13} />
                    </Link>
                  ) : (
                    <span className="badge badge-neutral">Stayed in chat</span>
                  )}
                </div>
              </div>

              <div className="transcript">
                {detail.data.messages.map((message) => {
                  const isCustomer = message.role === "customer";
                  return (
                    <div key={message.id} className={`bubble-row ${isCustomer ? "is-user" : ""}`}>
                      {isCustomer ? null : (
                        <span className="chat-avatar">
                          <Sparkles size={16} />
                        </span>
                      )}
                      <div className="bubble-wrap">
                        <div className="bubble">{message.body}</div>
                        <div className="bubble-time">{formatTime(message.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState
              icon={MessagesSquare}
              title="Couldn't open this conversation"
              body={detail.error ?? "Try selecting another conversation."}
            />
          )}
        </Card>
      </div>
    </>
  );
}
