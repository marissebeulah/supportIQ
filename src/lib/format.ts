import type { Priority, Role, Status } from "./types";

export const STATUS_ORDER: Status[] = ["open", "in_progress", "waiting_customer", "resolved", "closed"];
export const PRIORITY_ORDER: Priority[] = ["low", "normal", "high", "urgent"];

export const STATUS_META: Record<Status, { label: string; short: string }> = {
  open: { label: "Open", short: "Open" },
  in_progress: { label: "In progress", short: "In progress" },
  waiting_customer: { label: "Waiting on customer", short: "Waiting on you" },
  resolved: { label: "Resolved", short: "Resolved" },
  closed: { label: "Closed", short: "Closed" },
};

export const PRIORITY_META: Record<Priority, { label: string }> = {
  low: { label: "Low" },
  normal: { label: "Normal" },
  high: { label: "High" },
  urgent: { label: "Urgent" },
};

export const CATEGORIES = [
  "Account access",
  "Technical issue",
  "Billing & invoices",
  "Device & hardware",
  "Data & exports",
  "How-to question",
  "Feature request",
  "Other",
];

export const ROLE_LABEL: Record<Role, string> = {
  customer: "Customer",
  it: "IT support",
  admin: "Administrator",
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

const longDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return dateTimeFormatter.format(toDate(value));
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return "—";
  return shortDateFormatter.format(toDate(value));
}

export function formatLongDate(value: string | null | undefined): string {
  if (!value) return "—";
  return longDateFormatter.format(toDate(value));
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  return timeFormatter.format(toDate(value));
}

export function formatDay(value: string | Date): string {
  const date = toDate(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return longDateFormatter.format(date);
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return "—";
  const diff = Date.now() - toDate(value).getTime();
  if (diff < 0) return formatShortDate(value);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return shortDateFormatter.format(toDate(value));
}

/** "3d 4h", "2h 14m" or "12m" — used for durations and remaining time. */
export function formatSpan(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  if (totalMinutes < 1) return "under a minute";
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

export function dueStatus(target: string, completed: string | null = null): { text: string; tone: "ok" | "soon" | "over" | "done" } {
  const targetMs = toDate(target).getTime();
  if (completed) {
    const completedMs = toDate(completed).getTime();
    return {
      text: completedMs <= targetMs ? "Target met" : `Missed by ${formatSpan(completedMs - targetMs)}`,
      tone: completedMs <= targetMs ? "done" : "over",
    };
  }
  const diff = targetMs - Date.now();
  if (diff < 0) return { text: `Overdue by ${formatSpan(-diff)}`, tone: "over" };
  if (diff < 60 * 60 * 1000) return { text: `Due in ${formatSpan(diff)}`, tone: "soon" };
  return { text: `Due in ${formatSpan(diff)}`, tone: "ok" };
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const rest = Math.round(minutes % 60);
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  return `${(minutes / 1440).toFixed(1)}d`;
}

export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return "—";
  if (hours < 24) return `${Number(hours.toFixed(2))}h`;
  return `${Number((hours / 24).toFixed(2))}d`;
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : (pluralForm ?? `${singular}s`);
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function percent(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

export function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

export function statusLabel(status: string): string {
  return STATUS_META[status as Status]?.label ?? status;
}

export function priorityLabel(priority: string): string {
  return PRIORITY_META[priority as Priority]?.label ?? priority;
}
