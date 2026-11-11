import { inspectMessage } from "./moderation.js";

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "have", "has", "from", "your", "you", "not",
  "can", "cant", "cannot", "does", "doesnt", "did", "didnt", "was", "were", "are", "is",
  "how", "what", "when", "where", "why", "who", "please", "need", "want", "about", "into",
  "still", "just", "help", "any", "all", "our", "their", "there", "here",
]);

const SALES_TERMS =
  /\b(pricing|price|prices|quote|discount|promo|promotion|promotional|coupon|sales|sell|purchase|buy|upgrade|downgrade|free trial|trial offer|special offer|plan options|marketing|advertising|advertise|product pitch|ad copy|sales copy)\b/;
const UNSAFE_REPLY_TERMS =
  /\b(pricing|price|prices|quote|discount|promo|promotion|promotional|coupon|sales|sell|purchase|buy now|upgrade now|free trial|trial offer|special offer|limited time|limited-time|contact sales|sales team|marketing|advertising|advertise|ad copy|sales copy|subscribe now)\b/i;
const EXTERNAL_CONTACT = /(?:https?:\/\/|www\.|mailto:|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b)/i;
const SUPPORT_CONTEXT =
  /\b(support|IT|request|ticket|account|sign[ -]?in|login|password|app|error|invoice|receipt|billing|attachment|screenshot|workspace|member|export|access|MFA|SSO|VPN|Wi-?Fi|printer|device|status|reply|target|issue|troubleshoot|team|help)\b/i;
const SAFE_SUPPORT_FALLBACK =
  "I can help with SupportIQ account access, app errors, and request status. For other support issues, create a request in SupportIQ so IT can help.";
const SAFE_SUPPORT_SUGGESTIONS = ["Create a support request", "How do I track my request?"];
const FAILURE_TERMS =
  /\b(fail|fails|failed|failing|error|errors|broken|breaks|stuck|crash|crashing|not working|isn't working|won't|wont|can't|cant|cannot|unable)\b/;
const HUMAN_TERMS =
  /\b(human|person|agent|technician|someone|representative|it support|support team|real person)\b/;
const TALK_TERMS = /\b(talk|speak|connect|chat|transfer|escalate|need|want|get me|reach)\b/;
const ESCALATION_TERMS =
  /\b(still (not|isn't|isnt|won't|wont|can't|cant|broken|failing)|didn't work|didnt work|doesn't work|doesnt work|not solved|not fixed|no luck|keeps? happening|already tried|tried that|again)\b/;

function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text) {
  return normalize(text)
    .split(" ")
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));
}

function scoreEntry(entry, normalized) {
  let score = 0;
  const keywords = String(entry.keywords || "")
    .split(",")
    .map((keyword) => normalize(keyword))
    .filter(Boolean);
  for (const keyword of keywords) {
    if (!keyword) continue;
    if (normalized.includes(keyword)) score += keyword.includes(" ") ? 6 : 4;
  }
  const entryWords = new Set(tokens(`${entry.question} ${entry.keywords}`));
  const queryWords = tokens(normalized);
  for (const word of queryWords) {
    if (entryWords.has(word)) score += 1;
  }
  return score;
}

export function botSuggestions(kb, count = 3) {
  return kb
    .filter((entry) => entry.enabled && isSafeSupportCopy(entry.question))
    .slice(0, count)
    .map((entry) => entry.question);
}

export function isSafeSupportCopy(value) {
  const text = String(value ?? "");
  return SUPPORT_CONTEXT.test(text) && !UNSAFE_REPLY_TERMS.test(text) && !EXTERNAL_CONTACT.test(text);
}

function generateBotReplyCandidate({ text, kb, settings, firstName = "there", hasPriorBotAnswer = false }) {
  const normalized = normalize(text);
  const greeting = `Hi ${firstName} — I'm the SupportIQ assistant. I can help with account access, app errors, invoices, and request status. What's happening today?`;

  if (!normalized) {
    return {
      body: "Tell me what's happening and I'll point you to the right support answer.",
      intent: "empty",
      recommendTicket: false,
      suggestions: botSuggestions(kb),
    };
  }

  const moderation = inspectMessage(text);
  if (moderation.isFlagged) {
    return {
      body:
        "For your security and privacy, SupportIQ does not conduct support via personal phone numbers, external emails, or outside chat links (such as WhatsApp, Telegram, or Discord). All communications are tracked and protected inside this official portal. Please describe your issue here or open a support request for our IT team.",
      intent: "guardrail",
      recommendTicket: true,
      suggestions: ["Create a support request", "Account access help", "Report a bug"],
    };
  }

  const asksForHuman = HUMAN_TERMS.test(normalized) && TALK_TERMS.test(normalized);
  if (asksForHuman || normalized.includes("talk to it support")) {
    return {
      body: settings.bot_escalation,
      intent: "handoff",
      recommendTicket: true,
      suggestions: ["Create a support request", "What should I include?"],
    };
  }

  if (normalized.includes("login problem") || normalized.includes("sign in") || normalized.includes("can't sign") || normalized.includes("cannot sign")) {
    // Try to match KB first, else guide
    // fall through to KB matching
  }
  if (normalized.includes("billing")) {
    // fall through
  }

  if (ESCALATION_TERMS.test(normalized) && hasPriorBotAnswer) {
    return {
      body: settings.bot_escalation,
      intent: "handoff",
      recommendTicket: true,
      suggestions: ["Create a support request", "How long until support replies?"],
    };
  }

  const isGreeting =
    /^(hi|hello|hey|good morning|good afternoon|good evening|yo)\b/.test(normalized) && normalized.length < 40;
  if (isGreeting) {
    return {
      body: settings.bot_greeting.replace(/\{first_name\}/g, firstName) || greeting,
      intent: "greeting",
      recommendTicket: false,
      suggestions: botSuggestions(kb),
    };
  }

  if (/^(thanks|thank you|thankyou|cheers|great|perfect|that fixed it|solved)\b/.test(normalized)) {
    return {
      body:
        "Glad that helped. If anything else comes up, I'm here for support questions — and you can always open a request so the IT team has the full picture.",
      intent: "thanks",
      recommendTicket: false,
      suggestions: botSuggestions(kb),
    };
  }

  const looksSales = SALES_TERMS.test(normalized);
  if (looksSales && !FAILURE_TERMS.test(normalized)) {
    return {
      body: settings.bot_guardrail,
      intent: "guardrail",
      recommendTicket: true,
      suggestions: ["I have an account issue", "Create a support request"],
    };
  }

  let best = null;
  let bestScore = 0;
  for (const entry of kb) {
    if (!entry.enabled) continue;
    const score = scoreEntry(entry, normalized);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }

  if (best && bestScore >= 3) {
    return {
      body: best.answer,
      intent: "answer",
      matchedQuestion: best.question,
      recommendTicket: false,
      suggestions: botSuggestions(
        kb.filter((entry) => entry.id !== best.id),
        3,
      ),
    };
  }

  if (FAILURE_TERMS.test(normalized) && hasPriorBotAnswer) {
    return {
      body: settings.bot_escalation,
      intent: "handoff",
      recommendTicket: true,
      suggestions: ["Create a support request", "What should I include?"],
    };
  }

  return {
    body: settings.bot_fallback,
    intent: "fallback",
    recommendTicket: true,
    suggestions: ["Create a support request", "What should I include?"],
  };
}

export function generateBotReply(options) {
  const reply = generateBotReplyCandidate(options);
  if (!isSafeSupportCopy(reply.body)) {
    return {
      body: SAFE_SUPPORT_FALLBACK,
      intent: "fallback",
      recommendTicket: true,
      suggestions: SAFE_SUPPORT_SUGGESTIONS,
    };
  }
  return {
    ...reply,
    suggestions: reply.suggestions.filter(isSafeSupportCopy).slice(0, 3),
  };
}

export const BOT_GREETING_SUGGESTIONS = [
  "I can't sign in",
  "The app isn't loading",
  "I need an invoice",
  "Talk to IT support",
];
