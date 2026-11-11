import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Lock, MessageSquare, Plus, RefreshCw, Send, Sparkles } from "lucide-react";
import { api, ApiError, errorMessage } from "../../lib/api";
import { useApi, useTitle } from "../../lib/hooks";
import { formatTime } from "../../lib/format";
import type { BotConversation, BotMessage, BotReplyResponse, Product } from "../../lib/types";
import { Button, ErrorNote, PageHead } from "../../components/ui";

export default function AssistantPage() {
  useTitle("Support assistant");
  const navigate = useNavigate();
  const conversationQuery = useApi<BotConversation>(() => api.get<BotConversation>("/api/bot/conversation"));
  const scheduleQuery = useApi<{ enabled: boolean; message?: string }>(() => api.get("/api/bot/schedule"));
  const productsQuery = useApi<{ products: Product[] }>(() => api.get("/api/bot/products"));

  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [recommendTicket, setRecommendTicket] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [productId, setProductId] = useState<number | null>(null);
  const [needsProduct, setNeedsProduct] = useState(true);
  const [productDetected, setProductDetected] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [guidedCategory, setGuidedCategory] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversationQuery.data) return;
    const conversation = conversationQuery.data;
    setMessages(conversation.messages);
    setSuggestions(conversation.suggestions);
    setRecommendTicket(conversation.recommendTicket);
    setEnabled(conversation.enabled);
    setConversationId(conversation.conversationId);
    setProductId(conversation.product?.id ?? null);
    setNeedsProduct(conversation.needsProduct);
    setProductDetected(false);
  }, [conversationQuery.data]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, sending]);

  const customerMessages = messages.filter((message) => message.role === "customer");

  const goCreateRequest = () => {
    if (!conversationId) return;
    const first = customerMessages[0]?.body ?? "";
    const last = customerMessages[customerMessages.length - 1]?.body ?? "";
    navigate("/portal/requests/new", {
      state: {
        botConversationId: conversationId,
        productId: productId ?? undefined,
        subject: first.replace(/\s+/g, " ").slice(0, 110),
        description: last,
        category: guidedCategory ?? undefined,
      },
    });
  };

  const changeProduct = async (value: string) => {
    const nextProductId = value ? Number(value) : null;
    setProductId(nextProductId);
    setNeedsProduct(nextProductId === null);
    setProductDetected(false);
    if (!conversationId) return;
    setSavingProduct(true);
    try {
      await api.patch("/api/bot/conversation/product", { productId: nextProductId });
    } catch (productError) {
      setError(errorMessage(productError));
    } finally {
      setSavingProduct(false);
    }
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || sending || !enabled) return;
    setError(null);
    setInput("");
    setSending(true);

    const optimistic: BotMessage = {
      id: -Date.now(),
      role: "customer",
      body: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);

    try {
      const response = await api.post<BotReplyResponse>("/api/bot/messages", { message: text });
      setMessages((current) => [...current.filter((message) => message.id !== optimistic.id), ...response.messages]);
      setSuggestions(response.suggestions);
      setRecommendTicket(response.recommendTicket);
      setConversationId(response.conversationId);
      setEnabled(response.enabled);
      setProductId(response.product?.id ?? null);
      setNeedsProduct(response.needsProduct);
      setProductDetected(response.productDetected);
    } catch (sendError) {
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setInput(text);
      setError(errorMessage(sendError));
      if (sendError instanceof ApiError && sendError.status === 409) setEnabled(false);
    } finally {
      setSending(false);
    }
  };

  const startNewConversation = async () => {
    if (resetting) return;
    setResetting(true);
    setError(null);
    try {
      const conversation = await api.post<BotConversation>("/api/bot/reset");
      setMessages(conversation.messages);
      setSuggestions(conversation.suggestions);
      setRecommendTicket(conversation.recommendTicket);
      setEnabled(conversation.enabled);
      setConversationId(conversation.conversationId);
      setProductId(conversation.product?.id ?? null);
      setNeedsProduct(conversation.needsProduct);
      setProductDetected(false);
      setInput("");
      setGuidedCategory(null);
    } catch (resetError) {
      setError(errorMessage(resetError));
    } finally {
      setResetting(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const chooseSuggestion = (suggestion: string) => {
    if (suggestion.toLowerCase().startsWith("create a support request")) {
      goCreateRequest();
      return;
    }
    const topicCategories: Record<string, string> = {
      "login problem": "Account access",
      "report a bug": "Technical issue",
      billing: "Billing & invoices",
      "how to use": "How-to question",
    };
    const matchedCategory = Object.entries(topicCategories).find(([topic]) =>
      suggestion.toLowerCase().includes(topic),
    )?.[1];
    if (matchedCategory) setGuidedCategory(matchedCategory);
    void send(suggestion);
  };

  return (
    <>
      <PageHead
        eyebrow="Support assistant"
        title="Tell us what's happening"
        description="The assistant answers from the support knowledge base and can bring IT in with your full conversation attached."
        actions={
          <Button variant="secondary" onClick={goCreateRequest} disabled={!conversationId}>
            <Plus size={15} /> Create a request
          </Button>
        }
      />

      <div className="chat-page">
        <section className="chat-card">
          {scheduleQuery.data?.enabled && scheduleQuery.data?.message ? (
            <div className="callout" style={{ margin: "12px 12px 0 12px" }}>
              <Clock size={15} />
              <div>{scheduleQuery.data.message}</div>
            </div>
          ) : null}
          <div className={`assistant-product-bar ${needsProduct ? "needs-product" : ""}`.trim()}>
            <div className="assistant-product-text">
              <label htmlFor="assistant-product-select">Product</label>
              <span className="assistant-product-hint">
                {productDetected
                  ? "Detected from your message — change it if that isn't right."
                  : needsProduct
                    ? "Which product is this concern about? It helps IT route it to the right team."
                    : "This conversation is linked to the selected product."}
              </span>
            </div>
            <select
              id="assistant-product-select"
              className="select"
              value={productId ?? ""}
              onChange={(event) => void changeProduct(event.target.value)}
              disabled={!conversationId || savingProduct || productsQuery.loading}
            >
              <option value="">Choose a product</option>
              {(productsQuery.data?.products ?? []).map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </div>
          <header className="chat-head">
            <span className="chat-avatar">
              <Sparkles size={17} />
            </span>
            <div className="chat-head-text">
              <div className="chat-head-title">
                SupportIQ Assistant
                <span className={`badge ${enabled ? "badge-resolved" : "badge-neutral"}`}>
                  {enabled ? "Online" : "Unavailable"}
                </span>
              </div>
              <p className="chat-head-sub">Support questions only · never sales or promotions</p>
            </div>
            <div className="chat-head-actions">
              <Button variant="ghost" size="sm" onClick={startNewConversation} loading={resetting}>
                <RefreshCw size={14} /> New chat
              </Button>
            </div>
          </header>

          <div className="chat-scroll" ref={scrollRef}>
            {conversationQuery.loading && !conversationQuery.data ? (
              <p className="muted small">Connecting to the support assistant…</p>
            ) : null}
            {conversationQuery.error ? <ErrorNote message={conversationQuery.error} /> : null}

            {messages.map((message) => {
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

            {sending ? (
              <div className="bubble-row">
                <span className="chat-avatar">
                  <Sparkles size={16} />
                </span>
                <div className="bubble">
                  <span className="typing" aria-label="Assistant is typing">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            ) : null}

            {error ? (
              <div style={{ marginTop: 8 }}>
                <ErrorNote message={error} />
              </div>
            ) : null}
          </div>

          {recommendTicket && enabled ? (
            <div className="escalate-banner">
              <MessageSquare size={16} />
              <p>
                This needs a person. Create a request and this conversation comes with it, so IT has the full
                picture without you repeating anything.
              </p>
              <Button variant="soft" size="sm" onClick={goCreateRequest}>
                Create request
              </Button>
            </div>
          ) : null}

          {enabled && suggestions.length && !sending ? (
            <div className="suggestions">
              {suggestions.slice(0, 4).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="chip"
                  onClick={() => chooseSuggestion(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}

          <div className="chat-composer">
            {enabled ? (
              <>
                <div className="chat-input">
                  <textarea
                    rows={1}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Describe what's happening…"
                    aria-label="Message the support assistant"
                    maxLength={1500}
                  />
                  <button
                    type="button"
                    className="chat-send"
                    onClick={() => void send()}
                    disabled={!input.trim() || sending}
                    aria-label="Send message"
                  >
                    <Send size={16} />
                  </button>
                </div>
                <p className="chat-footnote">
                  <Lock size={11} /> Support only. Your messages stay inside SupportIQ.
                </p>
              </>
            ) : (
              <div className="callout">
                <Lock size={15} />
                <div>
                  The support assistant is currently unavailable. You can still create a request and the IT
                  support team will respond in this portal.
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="chat-aside stack">
          <div className="card">
            <div className="aside-panel">
              <p className="eyebrow">Need a person?</p>
              <p className="aside-title">Hand this to IT support</p>
              <p className="aside-text">
                If the assistant can't resolve it, create a request. Every message from this chat is attached
                for the agent automatically.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="aside-panel">
              <p className="aside-title">What the assistant can help with</p>
              <ul className="aside-list">
                <li>
                  <Sparkles size={13} /> Sign-in and account access questions
                </li>
                <li>
                  <Sparkles size={13} /> App errors and troubleshooting steps
                </li>
                <li>
                  <Sparkles size={13} /> Invoices, receipts, and exports
                </li>
                <li>
                  <Sparkles size={13} /> How long support will take
                </li>
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="aside-panel">
              <div className="aside-title">
                <Lock size={12} style={{ verticalAlign: "-1px", marginRight: 5 }} />
                Support only
              </div>
              <p className="aside-text">
                The assistant won't discuss pricing, promotions, or sales. If something in your account needs a
                person, it will offer to open a request instead.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
