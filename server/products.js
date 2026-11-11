// Shared product inference helpers.
// Products are a first-class concern dimension in SupportIQ: tickets, assistant
// conversations, dashboards, and filters all group by product.

const PRODUCT_HINTS = {
  Payro: [
    "payment",
    "payments",
    "payout",
    "checkout",
    "transaction",
    "settlement",
    "gateway",
    "webhook",
    "webhooks",
    "alert routing",
    "routing rule",
    "api",
    "endpoint",
    "latency",
    "sync",
    "integration",
    "deploy",
  ],
  Eduvia: [
    "course",
    "courses",
    "student",
    "students",
    "learning",
    "lesson",
    "classroom",
    "enrollment",
    "education",
    "campus",
    "quiz",
    "assignment",
    "docs",
    "search",
    "bulk import",
    "bulk-import",
    "import users",
    "scheduled report",
  ],
  Vaulta: [
    "password",
    "login",
    "sign in",
    "sign-in",
    "sso",
    "single sign",
    "mfa",
    "2fa",
    "two-factor",
    "authentication",
    "identity",
    "api key",
    "api keys",
    "permission",
    "permissions",
    "access",
    "member",
    "members",
    "audit log",
    "audit logs",
    "audit retention",
    "security",
    "export",
    "data export",
  ],
  Finara: [
    "invoice",
    "invoices",
    "receipt",
    "receipts",
    "billing",
    "vat",
    "tax",
    "finance",
    "subscription",
    "tier",
    "contract",
    "ledger",
    "payment run",
  ],
  "VendiX POS": [
    "pos",
    "terminal",
    "card reader",
    "retail",
    "store",
    "register",
    "inventory",
    "receipt printer",
    "desktop app",
    "mobile app",
    "install",
    "installer",
    "windows",
    "laptop",
    "hardware",
    "device",
    "dashboard",
    "dashboards",
    "freeze",
    "freezes",
    "freezing",
    "frozen",
    "crash",
    "crashes",
    "scroll",
    "return label",
    "vendix",
    "pc",
    "thermal paper",
    "receipt paper",
    "paper roll",
  ],
  NenPOS: [
    "restaurant",
    "kitchen",
    "menu",
    "table",
    "order",
    "orders",
    "hospitality",
    "waiter",
    "cash drawer",
  ],
};

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function productHintScore(productName, text) {
  const normalized = normalize(text);
  if (!normalized) return 0;

  const padded = ` ${normalized} `;
  const tokens = new Set(normalized.split(" "));

  const matches = (value) => {
    if (!value) return false;
    if (value.includes(" ")) return padded.includes(` ${value} `);
    return tokens.has(value);
  };

  let score = 0;
  const name = normalize(productName);
  if (matches(name)) score += 20;

  for (const hint of PRODUCT_HINTS[productName] ?? []) {
    const normalizedHint = normalize(hint);
    if (matches(normalizedHint)) {
      score += normalizedHint.includes(" ") ? 6 : 3;
    }
  }
  return score;
}

/**
 * Find the most likely product for a block of text.
 * Explicit product names always win; otherwise the strongest keyword hint wins.
 */
export function inferProduct(text, products) {
  let best = null;
  let bestScore = 0;
  for (const product of products ?? []) {
    const score = productHintScore(product.name, text);
    if (score > bestScore) {
      best = product;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

export function inferProductId(text, products) {
  const product = inferProduct(text, products);
  return product ? product.id : null;
}

function ticketConcernText(ticket) {
  return [ticket.subject, ticket.description].filter(Boolean).join(" ");
}

/**
 * Give existing tickets and assistant conversations a product where the text
 * clearly points at one. This is idempotent and never overwrites a product a
 * customer or agent has already chosen.
 */
export function backfillProductAssignments(db) {
  const products = db.prepare("SELECT id, name, enabled FROM products ORDER BY id").all();
  if (!products.length) return { tickets: 0, conversations: 0 };

  const updateTicket = db.prepare("UPDATE tickets SET product_id = ? WHERE id = ?");
  let ticketUpdates = 0;
  for (const ticket of db.prepare("SELECT id, subject, description, product_id FROM tickets").all()) {
    if (ticket.product_id) continue;
    const product = inferProduct(ticketConcernText(ticket), products);
    if (!product) continue;
    updateTicket.run(product.id, ticket.id);
    ticketUpdates += 1;
  }

  const updateConversation = db.prepare("UPDATE bot_conversations SET product_id = ? WHERE id = ?");
  let conversationUpdates = 0;
  for (const conversation of db
    .prepare("SELECT id, product_id, escalated_ticket_id FROM bot_conversations")
    .all()) {
    if (conversation.product_id) continue;

    const customerText = db
      .prepare("SELECT body FROM bot_messages WHERE conversation_id = ? AND role = 'customer' ORDER BY created_at, id")
      .all(conversation.id)
      .map((message) => message.body)
      .join(" ");

    let product = inferProduct(customerText, products);
    if (!product && conversation.escalated_ticket_id) {
      const ticket = db
        .prepare("SELECT product_id FROM tickets WHERE id = ?")
        .get(conversation.escalated_ticket_id);
      product = ticket?.product_id
        ? products.find((entry) => entry.id === ticket.product_id)
        : null;
    }
    if (!product) continue;
    updateConversation.run(product.id, conversation.id);
    conversationUpdates += 1;
  }

  return { tickets: ticketUpdates, conversations: conversationUpdates };
}

export { PRODUCT_HINTS };
