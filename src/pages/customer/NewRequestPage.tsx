import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Lock, MessageSquare, Paperclip, Send, Sparkles, Timer } from "lucide-react";
import { api, errorMessage } from "../../lib/api";
import { useApi, useTitle } from "../../lib/hooks";
import { CATEGORIES, PRIORITY_META } from "../../lib/format";
import type { Attachment, Priority, Product, TicketDetailResponse } from "../../lib/types";
import { Button, Card, CardHead, ErrorNote, Field, PageHead, Select } from "../../components/ui";
import { AttachmentUpload } from "../../components/AttachmentUpload";
import { useToast } from "../../components/toast";

type AssistantHandoff = {
  botConversationId?: number;
  productId?: number;
  subject?: string;
  description?: string;
  category?: string;
};

const PRIORITY_HELP: Record<Priority, string> = {
  low: "Question or small request",
  normal: "Something isn't working",
  high: "Blocking part of my work",
  urgent: "Work has stopped",
};

type NewRequestPageProps = { portal?: "customer" | "admin" };

export default function NewRequestPage({ portal = "customer" }: NewRequestPageProps) {
  const isAdmin = portal === "admin";
  useTitle(isAdmin ? "Create request" : "New request");
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const customers = useApi<{ customers: { id: number; name: string; email: string; company: string | null }[] }>(
    () => api.get("/api/admin/customers"),
    [],
    { enabled: isAdmin },
  );
  const productsQuery = useApi<{ products: Product[] }>(
    () => api.get(isAdmin ? "/api/admin/products" : "/api/bot/products"),
  );
  const handoff = (location.state ?? {}) as AssistantHandoff;

  const [customerId, setCustomerId] = useState("");
  const [productId, setProductId] = useState(handoff.productId ? String(handoff.productId) : "");
  const [subject, setSubject] = useState(handoff.subject ?? "");
  const [description, setDescription] = useState(handoff.description ?? "");
  const [category, setCategory] = useState(
    handoff.category && CATEGORIES.includes(handoff.category) ? handoff.category : "Technical issue",
  );
  const [priority, setPriority] = useState<Priority>("normal");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (subject.trim().length < 4) {
      setError("Add a subject with at least 4 characters.");
      return;
    }
    if (description.trim().length < 3) {
      setError("Describe the issue so IT can help.");
      return;
    }
    if (isAdmin && !customerId) {
      setError("Choose a customer for this request.");
      return;
    }
    if (!productId) {
      setError("Choose a product, or select “Not sure / not listed”.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await api.post<TicketDetailResponse>("/api/tickets", {
        customerId: isAdmin ? Number(customerId) : undefined,
        productId: productId === "none" ? null : Number(productId),
        subject: subject.trim(),
        description: description.trim(),
        category,
        priority,
        attachmentIds: attachments.map((attachment) => attachment.id),
        botConversationId: handoff.botConversationId,
      });
      toast(isAdmin ? `Request ${response.ticket.ref} created for the customer.` : `Request ${response.ticket.ref} created. IT support has been notified.`);
      navigate(`${isAdmin ? "/admin" : "/portal"}/requests/${response.ticket.id}`, { replace: true });
    } catch (submitError) {
      setError(errorMessage(submitError));
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow={isAdmin ? "Admin monitoring" : "Customer portal"}
        title={isAdmin ? "Create a request for a customer" : "Create a support request"}
        description={isAdmin ? "Record a customer request and make it visible in their portal." : "Give IT the details they need. You'll get a reference number and a confirmation here immediately."}
      />

      <div className="request-layout">
        <Card>
          <CardHead
            title="Request details"
            description="The more specific you are, the faster this gets resolved."
          />
          <form className="card-body" onSubmit={submit}>
            <div className="form-grid">
              {error ? (
                <div className="field-full">
                  <ErrorNote message={error} />
                </div>
              ) : null}

              {isAdmin ? (
                <Field label="Customer" htmlFor="customerId" className="field-full">
                  <Select id="customerId" value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
                    <option value="">Choose a customer</option>
                    {(customers.data?.customers ?? []).map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} · {customer.email}{customer.company ? ` · ${customer.company}` : ""}
                      </option>
                    ))}
                  </Select>
                  {customers.error ? <ErrorNote message={customers.error} /> : null}
                </Field>
              ) : null}

              <Field label="Subject" htmlFor="subject" className="field-full" hint="A short summary, e.g. “SSO login loops after provider change”.">
                <input
                  id="subject"
                  className="input"
                  value={subject}
                  maxLength={160}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="What do you need help with?"
                  required
                />
              </Field>

              <Field label="Category" htmlFor="category">
                <Select id="category" value={category} onChange={(event) => setCategory(event.target.value)}>
                  {CATEGORIES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Product"
                htmlFor="product"
                hint="Choose the product your issue is about so the right team picks it up."
              >
                <Select
                  id="product"
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                  required
                >
                  <option value="">Choose a product</option>
                  {(productsQuery.data?.products ?? []).map((product) => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
                  <option value="none">Not sure / not listed</option>
                </Select>
              </Field>

              <Field label="Priority" hint={`Selected: ${PRIORITY_META[priority].label}`}>
                <div className="priority-grid" role="radiogroup" aria-label="Priority">
                  {(Object.keys(PRIORITY_META) as Priority[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={priority === option}
                      className={`priority-option ${priority === option ? "is-selected" : ""}`}
                      onClick={() => setPriority(option)}
                    >
                      <strong>{PRIORITY_META[option].label}</strong>
                      <span>{PRIORITY_HELP[option]}</span>
                    </button>
                  ))}
                </div>
              </Field>

              <Field
                label="What's happening?"
                htmlFor="description"
                className="field-full"
                hint="Include the exact error, when it started, and what you've already tried. Don't share passwords or MFA codes."
              >
                <textarea
                  id="description"
                  className="textarea"
                  value={description}
                  maxLength={5000}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe the issue, what you expected, and what happened instead…"
                  required
                />
              </Field>

              <div className="field-full">
                <AttachmentUpload value={attachments} onChange={setAttachments} disabled={submitting} />
              </div>
            </div>

            {handoff.botConversationId ? (
              <div className="callout callout-accent" style={{ marginTop: 14 }}>
                <Sparkles size={15} />
                <div>
                  <strong>Assistant context attached.</strong> Your chat with the SupportIQ assistant will be
                  included for the IT agent, so you won't need to repeat it.
                </div>
              </div>
            ) : null}

            <div className="form-actions" style={{ marginTop: 18 }}>
              <Button type="submit" size="lg" loading={submitting}>
                <Send size={15} /> Submit request
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate(isAdmin ? "/admin/requests" : "/portal/requests")}
                disabled={submitting}
              >
                Cancel
              </Button>
              <span className="small muted" style={{ marginLeft: "auto" }}>
                <Lock size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />
                {isAdmin ? "Visible to the selected customer and support team" : "Visible only to you and IT"}
              </span>
            </div>
          </form>
        </Card>

        <div className="stack">
          <Card>
            <CardHead title="What happens next" />
            <div className="card-body">
              <ol className="steps">
                <li>
                  <span className="step-num">1</span>
                  <div>
                    <strong>{isAdmin ? "Customer confirmation" : "Instant confirmation"}</strong>
                    <p>{isAdmin ? "The customer will see this request and its response target in their portal." : "You'll get a reference number and an estimated first-response target."}</p>
                  </div>
                </li>
                <li>
                  <span className="step-num">2</span>
                  <div>
                    <strong>An agent takes ownership</strong>
                    <p>IT reviews the details and replies in this request's conversation.</p>
                  </div>
                </li>
                <li>
                  <span className="step-num">3</span>
                  <div>
                    <strong>{isAdmin ? "Resolve, confirm, rate" : "Resolve, confirm, rate"}</strong>
                    <p>{isAdmin ? "The customer can confirm the resolution and rate the service in their portal." : "Once fixed, confirm it and rate the service. Admins monitor every request."}</p>
                  </div>
                </li>
              </ol>
            </div>
          </Card>

          <Card>
            <div className="card-body">
              <p className="section-title">
                <Timer size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} /> Response targets
              </p>
              <dl className="detail-list">
                <div className="detail-row">
                  <dt>Urgent</dt>
                  <dd>1 hour</dd>
                </div>
                <div className="detail-row">
                  <dt>High</dt>
                  <dd>2 hours</dd>
                </div>
                <div className="detail-row">
                  <dt>Normal</dt>
                  <dd>8 hours</dd>
                </div>
                <div className="detail-row">
                  <dt>Low</dt>
                  <dd>1 business day</dd>
                </div>
              </dl>
              <p className="hint" style={{ marginTop: 8 }}>
                Targets set by your support team. The exact deadline for this request is shown on the request
                page.
              </p>
            </div>
          </Card>

          <div className="callout">
            <MessageSquare size={15} />
            <div>
              <strong>One thread, start to finish.</strong> Replies, screenshots, and status changes all stay
              inside SupportIQ — never over email or chat apps.
            </div>
          </div>

          <div className="callout">
            <Paperclip size={15} />
            <div>
              A screenshot with the error and a timestamp helps IT resolve this faster. You can attach PNG,
              JPEG, WebP, GIF, or PDF up to 5 MB.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
