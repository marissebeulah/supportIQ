export function renderTemplate(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

export function firstName(name = "") {
  return String(name).trim().split(/\s+/)[0] || "there";
}

export function formatHours(hours) {
  const value = Number(hours);
  if (!Number.isFinite(value)) return "—";
  if (value < 1) return `${Math.round(value * 60)} minutes`;
  if (value === 1) return "1 hour";
  if (value < 24) return `${Math.round(value)} hours`;
  if (value === 24) return "1 business day";
  return `${Math.round(value / 24)} days`;
}

export function priorityLabel(priority) {
  return { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" }[priority] ?? "Normal";
}

export function statusLabel(status) {
  return (
    {
      open: "Open",
      in_progress: "In progress",
      waiting_customer: "Waiting on customer",
      resolved: "Resolved",
      closed: "Closed",
    }[status] ?? "Open"
  );
}
