import { useEffect, useState } from "react";
import {
  Check,
  FileText,
  Lock,
  MessagesSquare,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash,
  Calendar,
} from "lucide-react";
import { useAuth } from "../../lib/auth";
import { api, errorMessage } from "../../lib/api";
import { useApi, useTitle } from "../../lib/hooks";
import { PRIORITY_META, PRIORITY_ORDER, firstName, formatHours } from "../../lib/format";
import type {
  AutomationPayload,
  AutomationSettings,
  CannedReply,
  KbEntry,
  Priority,
  SlaMap,
  Product,
  Tag as TagType,
  BotButton,
  BotCondition,
  SupportSchedule,
} from "../../lib/types";
import {
  Button,
  Card,
  CardHead,
  ConfirmDialog,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  Modal,
  PageHead,
  PaginatedList,
  PriorityPill,
  Segmented,
  Spinner,
  Switch,
  Tag,
} from "../../components/ui";
import { useToast } from "../../components/toast";

type Tab = "assistant" | "ack" | "sla" | "kb" | "replies" | "boteditor" | "schedule";
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

type KbDraft = {
  id?: number;
  question: string;
  answer: string;
  keywords: string;
  category: string;
  enabled: boolean;
};

type ReplyDraft = { id?: number; title: string; body: string };

type ButtonDraft = { id?: number; label: string; action: string; sort_order: number; enabled: boolean };

type ProductDraft = { id?: number; name: string; enabled: boolean };

type TagDraft = { id?: number; name: string; type: string };

type ConditionDraft = { id?: number; name: string; trigger_type: string; trigger_value: string; action_type: string; action_value: string; priority: number; enabled: boolean };

const EMPTY_KB: KbDraft = {
  question: "",
  answer: "",
  keywords: "",
  category: "General",
  enabled: true,
};

const EMPTY_CONDITION: ConditionDraft = {
  name: "",
  trigger_type: "keyword",
  trigger_value: "",
  action_type: "route_to_it",
  action_value: "",
  priority: 0,
  enabled: true,
};

export default function AutomationPage() {
  useTitle("Automation");
  const { user } = useAuth();
  const { toast } = useToast();
  const automation = useApi<AutomationPayload>(() => api.get<AutomationPayload>("/api/admin/settings"));
  const data = automation.data;

  const [tab, setTab] = useState<Tab>("assistant");
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [sla, setSla] = useState<SlaMap | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const [kbForm, setKbForm] = useState<KbDraft | null>(null);
  const [kbError, setKbError] = useState<string | null>(null);
  const [kbDelete, setKbDelete] = useState<KbEntry | null>(null);
  const [kbBusy, setKbBusy] = useState(false);

  const [replyForm, setReplyForm] = useState<ReplyDraft | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyDelete, setReplyDelete] = useState<CannedReply | null>(null);
  const [replyBusy, setReplyBusy] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [tags, setTags] = useState<TagType[]>([]);
  const [botButtons, setBotButtons] = useState<BotButton[]>([]);
  const [botConditions, setBotConditions] = useState<BotCondition[]>([]);
  const [supportSchedule, setSupportSchedule] = useState<SupportSchedule | null>(null);
  const [conditionForm, setConditionForm] = useState<ConditionDraft | null>(null);
  const [conditionError, setConditionError] = useState<string | null>(null);
  const [conditionBusy, setConditionBusy] = useState(false);
  const [tagName, setTagName] = useState("");
  const [tagType, setTagType] = useState("issue");
  const [tagBusy, setTagBusy] = useState(false);
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [productName, setProductName] = useState("");

  useEffect(() => {
    if (!data) return;
    setSettings({
      ...data.settings,
      bot_welcome_buttons: data.botButtons?.filter((button) => button.enabled).map((button) => button.label)
        ?? data.settings.bot_welcome_buttons,
    });
    setSla(data.sla);
    if (data.products) setProducts(data.products);
    if (data.tags) setTags(data.tags);
    if (data.botButtons) setBotButtons(data.botButtons);
    if (data.botConditions) setBotConditions(data.botConditions);
    if (data.supportSchedule) setSupportSchedule(data.supportSchedule);
  }, [data]);

  const updateSetting = <K extends keyof AutomationSettings>(key: K, value: AutomationSettings[K]) => {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  };

  const saveBotButtons = async () => {
    if (!settings) return;
    const labels = (settings.bot_welcome_buttons ?? []).map((label) => label.trim()).filter(Boolean);
    if (!labels.length) {
      setSettingsError("Keep at least one welcome button enabled.");
      return;
    }
    setSettingsError(null);
    setSaving("buttons");
    try {
      const current = [...botButtons].sort((left, right) => left.sort_order - right.sort_order);
      for (let index = 0; index < labels.length; index += 1) {
        const label = labels[index];
        const action = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        if (current[index]) {
          await api.patch(`/api/admin/bot-buttons/${current[index].id}`, {
            label,
            action,
            sort_order: index + 1,
            enabled: true,
          });
        } else {
          await api.post("/api/admin/bot-buttons", { label, action, sort_order: index + 1 });
        }
      }
      for (const button of current.slice(labels.length)) {
        await api.del(`/api/admin/bot-buttons/${button.id}`);
      }
      await api.put("/api/admin/settings", { bot_welcome_buttons: labels });
      await api.put("/api/admin/settings", {
        bot_guided_questions_enabled: settings.bot_guided_questions_enabled ?? true,
      });
      const response = await api.get<AutomationPayload>("/api/admin/settings");
      automation.setData(response);
      toast("Bot buttons saved.");
    } catch (error) {
      setSettingsError(errorMessage(error));
    } finally {
      setSaving(null);
    }
  };

  const openCondition = (condition?: BotCondition) => {
    setConditionError(null);
    setConditionForm(condition ? { ...condition } : { ...EMPTY_CONDITION });
  };

  const saveCondition = async () => {
    if (!conditionForm) return;
    if (!conditionForm.name.trim()) {
      setConditionError("Enter a name for this routing condition.");
      return;
    }
    if (conditionForm.trigger_type !== "urgent" && !conditionForm.trigger_value.trim()) {
      setConditionError("Enter a trigger value for this condition.");
      return;
    }
    setConditionBusy(true);
    setConditionError(null);
    try {
      const payload = {
        ...conditionForm,
        name: conditionForm.name.trim(),
        trigger_value: conditionForm.trigger_value.trim(),
        action_value: conditionForm.action_value.trim(),
      };
      const response = conditionForm.id
        ? await api.patch<{ condition: BotCondition }>(`/api/admin/bot-conditions/${conditionForm.id}`, payload)
        : await api.post<{ condition: BotCondition }>("/api/admin/bot-conditions", payload);
      setBotConditions((current) => {
        const next = conditionForm.id
          ? current.map((condition) => condition.id === response.condition.id ? response.condition : condition)
          : [...current, response.condition];
        return next.sort((left, right) => right.priority - left.priority);
      });
      setConditionForm(null);
      toast(conditionForm.id ? "Routing condition updated." : "Routing condition added.");
    } catch (error) {
      setConditionError(errorMessage(error));
    } finally {
      setConditionBusy(false);
    }
  };

  const toggleCondition = async (condition: BotCondition, enabled: boolean) => {
    try {
      await api.patch(`/api/admin/bot-conditions/${condition.id}`, { enabled });
      setBotConditions((current) => current.map((item) => item.id === condition.id ? { ...item, enabled } : item));
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  const deleteCondition = async (condition: BotCondition) => {
    try {
      await api.del(`/api/admin/bot-conditions/${condition.id}`);
      setBotConditions((current) => current.filter((item) => item.id !== condition.id));
      toast("Routing condition deleted.");
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  const createTag = async () => {
    if (!tagName.trim() || tagBusy) return;
    setTagBusy(true);
    try {
      const response = editingTagId
        ? await api.patch<{ tag: TagType }>(`/api/admin/tags/${editingTagId}`, { name: tagName.trim(), type: tagType })
        : await api.post<{ tag: TagType }>("/api/admin/tags", { name: tagName.trim(), type: tagType });
      setTags((current) => {
        const next = editingTagId
          ? current.map((tag) => tag.id === response.tag.id ? response.tag : tag)
          : [...current, response.tag];
        return next.sort((left, right) => left.name.localeCompare(right.name));
      });
      setTagName("");
      setEditingTagId(null);
      toast(editingTagId ? "Tag updated." : "Tag added.");
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setTagBusy(false);
    }
  };

  const deleteTag = async (tag: TagType) => {
    try {
      await api.del(`/api/admin/tags/${tag.id}`);
      setTags((current) => current.filter((item) => item.id !== tag.id));
      toast("Tag deleted.");
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  const createProduct = async () => {
    if (!productName.trim()) return;
    try {
      const response = await api.post<{ product: Product }>("/api/admin/products", { name: productName.trim() });
      setProducts((current) => [...current, response.product].sort((left, right) => left.name.localeCompare(right.name)));
      setProductName("");
      toast("Product added.");
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  const saveAssistant = async () => {
    if (!settings) return;
    setSettingsError(null);
    setSaving("assistant");
    try {
      const response = await api.put<AutomationPayload>("/api/admin/settings", {
        bot_enabled: settings.bot_enabled,
        bot_greeting: settings.bot_greeting,
        bot_fallback: settings.bot_fallback,
        bot_escalation: settings.bot_escalation,
        bot_guardrail: settings.bot_guardrail,
      });
      automation.setData(response);
      toast("Assistant settings saved.");
    } catch (error) {
      setSettingsError(errorMessage(error));
    } finally {
      setSaving(null);
    }
  };

  const saveAck = async () => {
    if (!settings) return;
    setSettingsError(null);
    setSaving("ack");
    try {
      const response = await api.put<AutomationPayload>("/api/admin/settings", {
        auto_ack: settings.auto_ack,
      });
      automation.setData(response);
      toast("Automatic acknowledgement saved.");
    } catch (error) {
      setSettingsError(errorMessage(error));
    } finally {
      setSaving(null);
    }
  };

  const slaIssue = (() => {
    if (!sla) return null;
    for (const priority of PRIORITY_ORDER) {
      const target = sla[priority];
      if (!Number.isFinite(target.response_hours) || target.response_hours < 0.25 || target.response_hours > 720) {
        return `${PRIORITY_META[priority].label}: the first-response target must be between 15 minutes and 30 days.`;
      }
      if (!Number.isFinite(target.resolve_hours) || target.resolve_hours < 0.25 || target.resolve_hours > 2160) {
        return `${PRIORITY_META[priority].label}: the resolution target must be between 15 minutes and 90 days.`;
      }
      if (target.resolve_hours < target.response_hours) {
        return `${PRIORITY_META[priority].label}: resolution can't be shorter than first response.`;
      }
    }
    return null;
  })();

  const saveSla = async () => {
    if (!sla) return;
    if (slaIssue) {
      setSettingsError(slaIssue);
      return;
    }
    setSettingsError(null);
    setSaving("sla");
    try {
      const response = await api.put<AutomationPayload>("/api/admin/settings", { sla });
      automation.setData(response);
      toast("Service targets updated.");
    } catch (error) {
      setSettingsError(errorMessage(error));
    } finally {
      setSaving(null);
    }
  };

  const setSlaHours = (priority: Priority, key: "response_hours" | "resolve_hours", value: string) => {
    const parsed = value === "" ? 0 : Number(value);
    setSla((current) =>
      current ? { ...current, [priority]: { ...current[priority], [key]: parsed } } : current,
    );
  };

  const updateScheduleDay = (day: string, key: "enabled" | "start" | "end", value: boolean | string) => {
    setSupportSchedule((current) => {
      if (!current) return current;
      const currentDay = current.schedule?.[day] ?? { enabled: false, start: "09:00", end: "18:00" };
      return {
        ...current,
        schedule: { ...current.schedule, [day]: { ...currentDay, [key]: value } },
      };
    });
  };

  const openKb = (entry?: KbEntry) => {
    setKbError(null);
    setKbForm(
      entry
        ? {
            id: entry.id,
            question: entry.question,
            answer: entry.answer,
            keywords: entry.keywords,
            category: entry.category,
            enabled: entry.enabled,
          }
        : { ...EMPTY_KB },
    );
  };

  const saveKb = async () => {
    if (!kbForm) return;
    if (kbForm.question.trim().length < 4) {
      setKbError("Add the customer question (at least 4 characters).");
      return;
    }
    if (kbForm.answer.trim().length < 5) {
      setKbError("Add an answer the assistant can use.");
      return;
    }
    setKbError(null);
    setKbBusy(true);
    try {
      const payload = {
        question: kbForm.question.trim(),
        answer: kbForm.answer.trim(),
        keywords: kbForm.keywords.trim(),
        category: kbForm.category.trim() || "General",
        enabled: kbForm.enabled,
      };
      if (kbForm.id) {
        const response = await api.patch<{ entry: KbEntry }>(`/api/admin/kb/${kbForm.id}`, payload);
        automation.setData((current) =>
          current
            ? { ...current, kb: current.kb.map((entry) => (entry.id === response.entry.id ? response.entry : entry)) }
            : current,
        );
        toast("Knowledge entry updated.");
      } else {
        const response = await api.post<{ entry: KbEntry }>("/api/admin/kb", payload);
        automation.setData((current) =>
          current ? { ...current, kb: [...current.kb, response.entry] } : current,
        );
        toast("Knowledge entry added.");
      }
      setKbForm(null);
    } catch (error) {
      setKbError(errorMessage(error));
    } finally {
      setKbBusy(false);
    }
  };

  const toggleKb = async (entry: KbEntry) => {
    setKbBusy(true);
    try {
      const response = await api.patch<{ entry: KbEntry }>(`/api/admin/kb/${entry.id}`, {
        enabled: !entry.enabled,
      });
      automation.setData((current) =>
        current
          ? { ...current, kb: current.kb.map((item) => (item.id === response.entry.id ? response.entry : item)) }
          : current,
      );
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setKbBusy(false);
    }
  };

  const confirmKbDelete = async () => {
    if (!kbDelete) return;
    setKbBusy(true);
    try {
      await api.del(`/api/admin/kb/${kbDelete.id}`);
      automation.setData((current) =>
        current ? { ...current, kb: current.kb.filter((entry) => entry.id !== kbDelete.id) } : current,
      );
      toast("Knowledge entry deleted.");
      setKbDelete(null);
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setKbBusy(false);
    }
  };

  const openReply = (reply?: CannedReply) => {
    setReplyError(null);
    setReplyForm(reply ? { id: reply.id, title: reply.title, body: reply.body } : { title: "", body: "" });
  };

  const saveReply = async () => {
    if (!replyForm) return;
    if (replyForm.title.trim().length < 3 || replyForm.body.trim().length < 5) {
      setReplyError("Add a title and the reply text.");
      return;
    }
    setReplyError(null);
    setReplyBusy(true);
    try {
      const payload = { title: replyForm.title.trim(), body: replyForm.body.trim() };
      if (replyForm.id) {
        const response = await api.patch<{ reply: CannedReply }>(
          `/api/admin/canned-replies/${replyForm.id}`,
          payload,
        );
        automation.setData((current) =>
          current
            ? {
                ...current,
                cannedReplies: current.cannedReplies.map((reply) =>
                  reply.id === response.reply.id ? response.reply : reply,
                ),
              }
            : current,
        );
        toast("Saved reply updated.");
      } else {
        const response = await api.post<{ reply: CannedReply }>("/api/admin/canned-replies", payload);
        automation.setData((current) =>
          current ? { ...current, cannedReplies: [...current.cannedReplies, response.reply] } : current,
        );
        toast("Saved reply added.");
      }
      setReplyForm(null);
    } catch (error) {
      setReplyError(errorMessage(error));
    } finally {
      setReplyBusy(false);
    }
  };

  const confirmReplyDelete = async () => {
    if (!replyDelete) return;
    setReplyBusy(true);
    try {
      await api.del(`/api/admin/canned-replies/${replyDelete.id}`);
      automation.setData((current) =>
        current
          ? {
              ...current,
              cannedReplies: current.cannedReplies.filter((reply) => reply.id !== replyDelete.id),
            }
          : current,
      );
      toast("Saved reply deleted.");
      setReplyDelete(null);
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setReplyBusy(false);
    }
  };

  if (automation.loading && !data) return <Spinner label="Loading automation settings…" />;
  if (!data || !settings || !sla) {
    return <ErrorNote message={automation.error ?? "Automation settings are unavailable."} />;
  }

  const ackPreview = settings.auto_ack
    .replace(/\{first_name\}/g, firstName(user?.name ?? "there"))
    .replace(/\{ticket_ref\}/g, "SIQ-1042")
    .replace(/\{response_target\}/g, "8 hours");

  return (
    <>
      <PageHead
        eyebrow="Admin monitoring"
        title="Automation controls"
        description="Manage the support assistant, automatic messages, service targets, and the answers IT works from."
      />

      <div className="filters">
        <Segmented
          ariaLabel="Automation sections"
          value={tab}
          onChange={setTab}
          options={[
            { value: "assistant", label: "Assistant" },
            { value: "ack", label: "Auto-acknowledgement" },
            { value: "sla", label: "SLA targets" },
            { value: "kb", label: "Knowledge base", count: data.kb.length },
            { value: "replies", label: "Saved replies", count: data.cannedReplies.length },
            { value: "boteditor", label: "Bot Editor" },
            { value: "schedule", label: "After-hours" },
          ]}
        />
      </div>

      {tab === "assistant" ? (
        <Card>
          <CardHead
            title="Support assistant"
            description="The only automated voice customers see before IT. It is restricted to support topics."
            action={
              <div className="row" style={{ gap: 9 }}>
                <span className="small muted">{settings.bot_enabled ? "Enabled" : "Disabled"}</span>
                <Switch
                  checked={settings.bot_enabled}
                  onChange={(next) => updateSetting("bot_enabled", next)}
                  label="Enable support assistant"
                />
              </div>
            }
          />
          <div className="card-body">
            <div className="callout callout-accent" style={{ marginBottom: 14 }}>
              <ShieldCheck size={15} />
              <div>
                <strong>Support-only guarantee.</strong> The assistant never sends sales, pricing, or
                promotional messages. Its guardrail reply is used when a customer asks about those topics.
              </div>
            </div>

            {settingsError ? <ErrorNote message={settingsError} /> : null}

            <div className="form-grid" style={{ marginTop: settingsError ? 12 : 0 }}>
              <Field
                label="Greeting"
                htmlFor="bot-greeting"
                className="field-full"
                hint="Shown when a customer opens the assistant. Variable: {first_name}"
              >
                <textarea
                  id="bot-greeting"
                  className="textarea"
                  style={{ minHeight: 84 }}
                  maxLength={2000}
                  value={settings.bot_greeting}
                  onChange={(event) => updateSetting("bot_greeting", event.target.value)}
                />
              </Field>
              <Field
                label="When the assistant doesn't have an answer"
                htmlFor="bot-fallback"
                className="field-full"
                hint="Should encourage the customer to create a request rather than guess."
              >
                <textarea
                  id="bot-fallback"
                  className="textarea"
                  style={{ minHeight: 84 }}
                  maxLength={2000}
                  value={settings.bot_fallback}
                  onChange={(event) => updateSetting("bot_fallback", event.target.value)}
                />
              </Field>
              <Field
                label="Handoff to IT"
                htmlFor="bot-escalation"
                className="field-full"
                hint="Used when the customer asks for a person or the issue persists."
              >
                <textarea
                  id="bot-escalation"
                  className="textarea"
                  style={{ minHeight: 84 }}
                  maxLength={2000}
                  value={settings.bot_escalation}
                  onChange={(event) => updateSetting("bot_escalation", event.target.value)}
                />
              </Field>
              <Field
                label="Support-only guardrail"
                htmlFor="bot-guardrail"
                className="field-full"
                hint="Used when a customer asks about sales, pricing, or promotions."
              >
                <textarea
                  id="bot-guardrail"
                  className="textarea"
                  style={{ minHeight: 84 }}
                  maxLength={2000}
                  value={settings.bot_guardrail}
                  onChange={(event) => updateSetting("bot_guardrail", event.target.value)}
                />
              </Field>
            </div>

            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button onClick={saveAssistant} loading={saving === "assistant"}>
                <Check size={15} /> Save assistant settings
              </Button>
              <span className="hint">Changes apply to new customer messages immediately.</span>
            </div>
          </div>
        </Card>
      ) : null}

      {tab === "ack" ? (
        <Card>
          <CardHead
            title="Automatic acknowledgement"
            description="Sent in every new request so the customer knows it's in the queue and what the target is."
          />
          <div className="card-body">
            {settingsError ? <ErrorNote message={settingsError} /> : null}

            <Field
              label="Acknowledgement message"
              hint="Variables: {first_name}, {ticket_ref}, {response_target}"
            >
              <textarea
                className="textarea"
                style={{ minHeight: 120 }}
                maxLength={2000}
                value={settings.auto_ack}
                onChange={(event) => updateSetting("auto_ack", event.target.value)}
              />
            </Field>

            <div className="template-preview" style={{ marginTop: 12 }}>
              <strong>Preview</strong>
              <p style={{ marginTop: 4 }}>{ackPreview}</p>
            </div>

            <div className="template-vars">
              <Tag>{"{first_name}"}</Tag>
              <Tag>{"{ticket_ref}"}</Tag>
              <Tag>{"{response_target}"}</Tag>
            </div>

            <div className="callout" style={{ marginTop: 14 }}>
              <MessagesSquare size={15} />
              <div>
                Acknowledgements are sent by the support system, not the assistant. They are never used for
                marketing.
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button onClick={saveAck} loading={saving === "ack"}>
                <Check size={15} /> Save acknowledgement
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {tab === "sla" ? (
        <Card>
          <CardHead
            title="Service level targets"
            description="Response and resolution windows per priority. Decimal hours are allowed — 0.25 is 15 minutes."
          />
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="table sla-table">
                <thead>
                  <tr>
                    <th>Priority</th>
                    <th>First response target</th>
                    <th>Resolution target</th>
                  </tr>
                </thead>
                <tbody>
                  {PRIORITY_ORDER.map((priority) => (
                    <tr key={priority}>
                      <td>
                        <PriorityPill priority={priority} />
                      </td>
                      <td>
                        <div className="hours-cell">
                          <input
                            className="input hours-input"
                            type="number"
                            min={0.25}
                            max={720}
                            step={0.25}
                            value={sla[priority].response_hours}
                            onChange={(event) => setSlaHours(priority, "response_hours", event.target.value)}
                            aria-label={`${PRIORITY_META[priority].label} first response hours`}
                          />
                          <span>hours · {formatHours(sla[priority].response_hours)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="hours-cell">
                          <input
                            className="input hours-input"
                            type="number"
                            min={0.25}
                            max={2160}
                            step={0.25}
                            value={sla[priority].resolve_hours}
                            onChange={(event) => setSlaHours(priority, "resolve_hours", event.target.value)}
                            aria-label={`${PRIORITY_META[priority].label} resolution hours`}
                          />
                          <span>hours · {formatHours(sla[priority].resolve_hours)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card-body" style={{ borderTop: "1px solid var(--line)" }}>
            {settingsError ? <ErrorNote message={settingsError} /> : null}
            <div className="form-actions" style={{ marginTop: settingsError ? 12 : 0 }}>
              <Button onClick={saveSla} loading={saving === "sla"} disabled={Boolean(slaIssue)}>
                <Check size={15} /> Save service targets
              </Button>
              {slaIssue ? <span className="error-text">{slaIssue}</span> : null}
              <span className="hint" style={{ marginLeft: "auto" }}>
                Targets recalculate on new and reprioritised requests.
              </span>
            </div>
          </div>
        </Card>
      ) : null}

      {tab === "kb" ? (
        <Card>
          <CardHead
            title="Support knowledge base"
            description="The assistant answers only from these entries. Keep them focused on support topics."
            action={
              <Button size="sm" onClick={() => openKb()}>
                <Plus size={14} /> Add entry
              </Button>
            }
          />
          <div className="card-body" style={{ padding: 0 }}>
            {data.kb.length ? (
              <PaginatedList items={data.kb} label="knowledge entries">
                {(pageItems) => pageItems.map((entry) => (
                  <div key={entry.id} className={`kb-item ${entry.enabled ? "" : "kb-disabled"}`.trim()}>
                    <div style={{ minWidth: 0 }}>
                      <p className="kb-q">{entry.question}</p>
                      <p className="kb-a">{entry.answer}</p>
                      <div className="kb-tags">
                        <Tag>{entry.category}</Tag>
                        <Tag className={entry.enabled ? "tag-accent" : ""}>
                          {entry.enabled ? "Enabled" : "Disabled"}
                        </Tag>
                        {entry.keywords
                          .split(",")
                          .map((keyword) => keyword.trim())
                          .filter(Boolean)
                          .slice(0, 3)
                          .map((keyword) => (
                            <Tag key={keyword}>{keyword}</Tag>
                          ))}
                      </div>
                    </div>
                    <div className="kb-actions">
                      <Switch
                        checked={entry.enabled}
                        onChange={() => void toggleKb(entry)}
                        label={`Toggle ${entry.question}`}
                        disabled={kbBusy}
                      />
                      <IconButton label={`Edit ${entry.question}`} onClick={() => openKb(entry)}>
                        <Pencil size={15} />
                      </IconButton>
                      <IconButton label={`Delete ${entry.question}`} onClick={() => setKbDelete(entry)}>
                        <Trash size={15} />
                      </IconButton>
                    </div>
                  </div>
                ))}
              </PaginatedList>
            ) : (
              <EmptyState
                icon={FileText}
                title="No knowledge entries"
                body="Add the questions IT answers most often so the assistant can help customers instantly."
                action={
                  <Button size="sm" onClick={() => openKb()}>
                    <Plus size={14} /> Add the first entry
                  </Button>
                }
              />
            )}
          </div>
        </Card>
      ) : null}

      {tab === "replies" ? (
        <Card>
          <CardHead
            title="Saved replies"
            description="Reusable, professional replies available to IT agents inside every request."
            action={
              <Button size="sm" onClick={() => openReply()}>
                <Plus size={14} /> Add reply
              </Button>
            }
          />
          <div className="card-body" style={{ padding: 0 }}>
            {data.cannedReplies.length ? (
              <PaginatedList items={data.cannedReplies} label="saved replies">
                {(pageItems) => pageItems.map((reply) => (
                  <div key={reply.id} className="canned-row">
                    <div style={{ minWidth: 0 }}>
                      <strong>{reply.title}</strong>
                      <p>{reply.body}</p>
                    </div>
                    <div className="kb-actions">
                      <IconButton label={`Edit ${reply.title}`} onClick={() => openReply(reply)}>
                        <Pencil size={15} />
                      </IconButton>
                      <IconButton label={`Delete ${reply.title}`} onClick={() => setReplyDelete(reply)}>
                        <Trash size={15} />
                      </IconButton>
                    </div>
                  </div>
                ))}
              </PaginatedList>
            ) : (
              <EmptyState
                icon={MessagesSquare}
                title="No saved replies yet"
                body="Save the replies agents send most often to keep responses consistent and fast."
                action={
                  <Button size="sm" onClick={() => openReply()}>
                    <Plus size={14} /> Add a reply
                  </Button>
                }
              />
            )}
          </div>
        </Card>
      ) : null}

      {tab === "boteditor" ? (
        <>
          <Card>
            <CardHead
              title="Bot welcome buttons"
              description="Buttons shown to customers when they first open the assistant."
            />
            <div className="card-body">
              <Field label="Welcome topics" hint="Comma separated. These are stored in the assistant's active button list.">
                <input
                  className="input"
                  value={(settings.bot_welcome_buttons || []).join(", ")}
                  onChange={(e) =>
                    updateSetting(
                      "bot_welcome_buttons",
                      e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    )
                  }
                />
              </Field>
              <div className="setting-row" style={{ marginTop: 12 }}>
                <div className="setting-text">
                  <strong>Guided intake buttons</strong>
                  <p>Show the topic buttons at the start of a customer chat.</p>
                </div>
                <Switch
                  checked={settings.bot_guided_questions_enabled ?? true}
                  onChange={(enabled) => updateSetting("bot_guided_questions_enabled", enabled)}
                  label="Enable guided intake buttons"
                />
              </div>
              <div className="form-actions" style={{ marginTop: 12 }}>
                <Button onClick={saveBotButtons} loading={saving === "buttons"}>
                  <Check size={15} /> Save buttons
                </Button>
              </div>
            </div>
          </Card>

          <Card style={{ marginTop: 14 }}>
            <CardHead title="Products" description="Products for smart routing (Payro, Eduvia, Vaulta, Finara, VendiX POS, etc.)" />
            <div className="card-body">
              <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <input className="input" style={{ maxWidth: 300 }} value={productName} maxLength={80} onChange={(event) => setProductName(event.target.value)} placeholder="Add a product name" aria-label="New product name" />
                <Button size="sm" onClick={createProduct} disabled={!productName.trim()}><Plus size={14} /> Add product</Button>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Enabled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(products || []).map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>
                          <Switch
                            checked={p.enabled}
                            onChange={async (next) => {
                              try {
                                await api.patch(`/api/admin/products/${p.id}`, { enabled: next });
                                setProducts((cur) => cur.map((x) => (x.id === p.id ? { ...x, enabled: next } : x)));
                              } catch (e) {
                                toast(errorMessage(e), "error");
                              }
                            }}
                            label={`Toggle ${p.name}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          <Card style={{ marginTop: 14 }}>
            <CardHead title="Tags" description="Auto-label tickets and customers by product, client and issue type" />
            <div className="card-body">
              <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <input className="input" style={{ maxWidth: 260 }} value={tagName} maxLength={80} onChange={(event) => setTagName(event.target.value)} placeholder="Add a tag" aria-label="New tag name" />
                <select className="select" value={tagType} onChange={(event) => setTagType(event.target.value)} aria-label="Tag type">
                  <option value="product">Product</option>
                  <option value="client">Client</option>
                  <option value="issue">Issue</option>
                  <option value="general">General</option>
                </select>
                <Button size="sm" onClick={createTag} disabled={!tagName.trim() || tagBusy} loading={tagBusy}>
                  {editingTagId ? <Check size={14} /> : <Plus size={14} />}{editingTagId ? " Save tag" : " Add tag"}
                </Button>
                {editingTagId ? <Button size="sm" variant="ghost" onClick={() => { setEditingTagId(null); setTagName(""); }}>Cancel</Button> : null}
              </div>
              <div className="kb-tags">
                {(tags || []).map((tag) => (
                  <span key={tag.id} className="tag">
                    {tag.name} ({tag.type})
                    <IconButton label={`Edit ${tag.name} tag`} onClick={() => { setEditingTagId(tag.id); setTagName(tag.name); setTagType(tag.type); }}><Pencil size={12} /></IconButton>
                    <IconButton label={`Delete ${tag.name} tag`} onClick={() => void deleteTag(tag)}><Trash size={12} /></IconButton>
                  </span>
                ))}
              </div>
            </div>
          </Card>

          <Card style={{ marginTop: 14 }}>
            <CardHead
              title="Conditions (smart routing)"
              description="Route by product, category, keywords, or urgency."
              action={<Button size="sm" onClick={() => openCondition()}><Plus size={14} /> Add condition</Button>}
            />
            <div className="card-body" style={{ padding: 0 }}>
              {botConditions.length ? (
                botConditions.map((condition) => (
                  <div className="kb-item" key={condition.id}>
                    <div style={{ minWidth: 0 }}>
                      <p className="kb-q">{condition.name}</p>
                      <p className="kb-a">
                        {condition.trigger_type === "urgent" ? "Urgent requests" : `${condition.trigger_type}: ${condition.trigger_value}`}
                        {" → "}{condition.action_type === "route_to_it" ? "Route to IT" : condition.action_type === "tag" ? `Apply tag ${condition.action_value}` : "Offer IT handoff"}
                      </p>
                    </div>
                    <div className="kb-actions">
                      <Switch checked={condition.enabled} onChange={(enabled) => void toggleCondition(condition, enabled)} label={`Enable ${condition.name}`} />
                      <IconButton label={`Edit ${condition.name}`} onClick={() => openCondition(condition)}><Pencil size={15} /></IconButton>
                      <IconButton label={`Delete ${condition.name}`} onClick={() => void deleteCondition(condition)}><Trash size={15} /></IconButton>
                    </div>
                  </div>
                ))
              ) : (
                <div className="card-body"><p className="muted small">No conditions configured yet.</p></div>
              )}
            </div>
          </Card>
        </>
      ) : null}

      {tab === "schedule" ? (
        <Card>
          <CardHead title="After-hours / Support schedule" description="Show support schedule; tickets still created and queued" />
          <div className="card-body">
            {settingsError ? <ErrorNote message={settingsError} /> : null}
            {supportSchedule ? (
              <>
                <div className="setting-row" style={{ marginBottom: 14 }}>
                  <div className="setting-text">
                    <strong>Support hours enabled</strong>
                    <p>Customers see the after-hours message outside these hours.</p>
                  </div>
                  <Switch
                    checked={supportSchedule.enabled}
                    onChange={(enabled) => setSupportSchedule((current) => current ? { ...current, enabled } : current)}
                    label="Enable support hours"
                  />
                </div>
                <div className="table-wrap" style={{ marginBottom: 16 }}>
                  <table className="table">
                    <thead><tr><th>Day</th><th>Open</th><th>Start</th><th>End</th></tr></thead>
                    <tbody>
                      {WEEKDAYS.map((day) => {
                        const hours = supportSchedule.schedule?.[day] ?? { enabled: false, start: "09:00", end: "18:00" };
                        return (
                          <tr key={day}>
                            <td style={{ textTransform: "capitalize" }}>{day}</td>
                            <td><Switch checked={Boolean(hours.enabled)} onChange={(enabled) => updateScheduleDay(day, "enabled", enabled)} label={`${day} support hours`} /></td>
                            <td><input className="input hours-input" type="time" value={hours.start ?? "09:00"} disabled={!hours.enabled} onChange={(event) => updateScheduleDay(day, "start", event.target.value)} aria-label={`${day} support start`} /></td>
                            <td><input className="input hours-input" type="time" value={hours.end ?? "18:00"} disabled={!hours.enabled} onChange={(event) => updateScheduleDay(day, "end", event.target.value)} aria-label={`${day} support end`} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
            {settings && (
              <Field label="Schedule message" className="field-full">
                <textarea
                  className="textarea"
                  style={{ minHeight: 80 }}
                  value={settings.support_schedule_message || ""}
                  onChange={(e) => updateSetting("support_schedule_message", e.target.value)}
                />
              </Field>
            )}
            <div className="form-actions" style={{ marginTop: 12 }}>
              <Button
                onClick={async () => {
                  if (!settings) return;
                  setSettingsError(null);
                  setSaving("ack");
                  try {
                    const response = await api.put<AutomationPayload>("/api/admin/settings", {
                      support_schedule_message: settings.support_schedule_message,
                      supportSchedule: supportSchedule,
                    });
                    automation.setData(response);
                    toast("Schedule settings saved.");
                  } catch (error) {
                    setSettingsError(errorMessage(error));
                  } finally {
                    setSaving(null);
                  }
                }}
                loading={saving === "ack"}
              >
                <Calendar size={15} /> Save schedule
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="callout" style={{ marginTop: 14 }}>
        <Lock size={15} />
        <div>
          <strong>Communication stays inside SupportIQ.</strong> Automated messages, assistant answers, and
          agent replies are all recorded on the request for admin review.
        </div>
      </div>

      <Modal
        open={conditionForm !== null}
        onClose={() => setConditionForm(null)}
        title={conditionForm?.id ? "Edit routing condition" : "Add routing condition"}
        description="Conditions run in priority order when the assistant or a new ticket matches."
        width={560}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConditionForm(null)} disabled={conditionBusy}>Cancel</Button>
            <Button onClick={saveCondition} loading={conditionBusy}>
              <Check size={15} /> {conditionForm?.id ? "Save condition" : "Add condition"}
            </Button>
          </>
        }
      >
        {conditionForm ? (
          <div className="form-grid">
            {conditionError ? <div className="field-full"><ErrorNote message={conditionError} /></div> : null}
            <Field label="Condition name" htmlFor="condition-name" className="field-full">
              <input id="condition-name" className="input" value={conditionForm.name} maxLength={80} onChange={(event) => setConditionForm({ ...conditionForm, name: event.target.value })} />
            </Field>
            <Field label="When" htmlFor="condition-trigger">
              <select id="condition-trigger" className="select" value={conditionForm.trigger_type} onChange={(event) => setConditionForm({ ...conditionForm, trigger_type: event.target.value })}>
                <option value="keyword">Keywords</option>
                <option value="product">Product</option>
                <option value="category">Category</option>
                <option value="urgent">Urgency</option>
              </select>
            </Field>
            <Field label="Priority" htmlFor="condition-priority" hint="Higher values run first.">
              <input id="condition-priority" className="input" type="number" value={conditionForm.priority} onChange={(event) => setConditionForm({ ...conditionForm, priority: Number(event.target.value) || 0 })} />
            </Field>
            {conditionForm.trigger_type !== "urgent" ? (
              <Field label="Match value" htmlFor="condition-value" className="field-full" hint={conditionForm.trigger_type === "keyword" ? "Enter comma-separated keywords." : "Enter the product or category name."}>
                <input id="condition-value" className="input" value={conditionForm.trigger_value} maxLength={200} onChange={(event) => setConditionForm({ ...conditionForm, trigger_value: event.target.value })} />
              </Field>
            ) : null}
            <Field label="Then" htmlFor="condition-action">
              <select id="condition-action" className="select" value={conditionForm.action_type} onChange={(event) => setConditionForm({ ...conditionForm, action_type: event.target.value })}>
                <option value="route_to_it">Route to IT</option>
                <option value="handoff">Offer IT handoff</option>
                <option value="tag">Apply a tag</option>
              </select>
            </Field>
            <Field label={conditionForm.action_type === "tag" ? "Tag name" : "IT agent ID (optional)"} htmlFor="condition-action-value" hint={conditionForm.action_type === "route_to_it" ? "Leave blank to assign to the least-loaded active agent." : undefined}>
              <input id="condition-action-value" className="input" value={conditionForm.action_value} maxLength={200} onChange={(event) => setConditionForm({ ...conditionForm, action_value: event.target.value })} />
            </Field>
            <div className="field-full setting-row">
              <div className="setting-text"><strong>Enabled</strong></div>
              <Switch checked={conditionForm.enabled} onChange={(enabled) => setConditionForm({ ...conditionForm, enabled })} label="Enable routing condition" />
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={kbForm !== null}
        onClose={() => setKbForm(null)}
        title={kbForm?.id ? "Edit knowledge entry" : "Add knowledge entry"}
        description="The assistant matches customer wording against these questions, answers, and keywords."
        width={620}
        footer={
          <>
            <Button variant="secondary" onClick={() => setKbForm(null)} disabled={kbBusy}>
              Cancel
            </Button>
            <Button onClick={saveKb} loading={kbBusy}>
              <Check size={15} /> {kbForm?.id ? "Save changes" : "Add entry"}
            </Button>
          </>
        }
      >
        {kbForm ? (
          <div className="form-grid">
            {kbError ? (
              <div className="field-full">
                <ErrorNote message={kbError} />
              </div>
            ) : null}
            <Field label="Customer question" htmlFor="kb-question" className="field-full">
              <input
                id="kb-question"
                className="input"
                value={kbForm.question}
                maxLength={200}
                onChange={(event) => setKbForm({ ...kbForm, question: event.target.value })}
                placeholder="e.g. How do I reset my password?"
              />
            </Field>
            <Field
              label="Answer"
              htmlFor="kb-answer"
              className="field-full"
              hint="Write the steps or guidance the assistant should give. Never include passwords or secrets."
            >
              <textarea
                id="kb-answer"
                className="textarea"
                style={{ minHeight: 120 }}
                maxLength={4000}
                value={kbForm.answer}
                onChange={(event) => setKbForm({ ...kbForm, answer: event.target.value })}
              />
            </Field>
            <Field label="Category" htmlFor="kb-category">
              <input
                id="kb-category"
                className="input"
                value={kbForm.category}
                maxLength={60}
                onChange={(event) => setKbForm({ ...kbForm, category: event.target.value })}
              />
            </Field>
            <Field
              label="Keywords"
              htmlFor="kb-keywords"
              hint="Comma separated, e.g. password, reset link, locked out"
            >
              <input
                id="kb-keywords"
                className="input"
                value={kbForm.keywords}
                maxLength={500}
                onChange={(event) => setKbForm({ ...kbForm, keywords: event.target.value })}
              />
            </Field>
            <div className="field-full setting-row" style={{ paddingTop: 8 }}>
              <div className="setting-text">
                <strong>Enabled</strong>
                <p>Disabled entries stay in the knowledge base but are never used by the assistant.</p>
              </div>
              <Switch
                checked={kbForm.enabled}
                onChange={(next) => setKbForm({ ...kbForm, enabled: next })}
                label="Enable this knowledge entry"
              />
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={replyForm !== null}
        onClose={() => setReplyForm(null)}
        title={replyForm?.id ? "Edit saved reply" : "Add saved reply"}
        description="Agents can insert this into a customer reply with one click."
        footer={
          <>
            <Button variant="secondary" onClick={() => setReplyForm(null)} disabled={replyBusy}>
              Cancel
            </Button>
            <Button onClick={saveReply} loading={replyBusy}>
              <Check size={15} /> {replyForm?.id ? "Save changes" : "Add reply"}
            </Button>
          </>
        }
      >
        {replyForm ? (
          <div className="form-grid">
            {replyError ? (
              <div className="field-full">
                <ErrorNote message={replyError} />
              </div>
            ) : null}
            <Field label="Title" htmlFor="reply-title" className="field-full">
              <input
                id="reply-title"
                className="input"
                value={replyForm.title}
                maxLength={120}
                onChange={(event) => setReplyForm({ ...replyForm, title: event.target.value })}
                placeholder="e.g. Request more detail"
              />
            </Field>
            <Field label="Reply text" htmlFor="reply-body" className="field-full">
              <textarea
                id="reply-body"
                className="textarea"
                style={{ minHeight: 130 }}
                maxLength={3000}
                value={replyForm.body}
                onChange={(event) => setReplyForm({ ...replyForm, body: event.target.value })}
              />
            </Field>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={kbDelete !== null}
        title="Delete this knowledge entry?"
        body={kbDelete ? `“${kbDelete.question}” will no longer be available to the assistant.` : undefined}
        confirmLabel="Delete entry"
        busy={kbBusy}
        onConfirm={confirmKbDelete}
        onCancel={() => setKbDelete(null)}
      />

      <ConfirmDialog
        open={replyDelete !== null}
        title="Delete this saved reply?"
        body={replyDelete ? `“${replyDelete.title}” will be removed for every agent.` : undefined}
        confirmLabel="Delete reply"
        busy={replyBusy}
        onConfirm={confirmReplyDelete}
        onCancel={() => setReplyDelete(null)}
      />
    </>
  );
}
