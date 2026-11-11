/**
 * SupportIQ Message Moderation & Policy Guardrails
 * 
 * Detects attempts to share:
 * 1. Phone numbers
 * 2. Email addresses
 * 3. Outside chat links (WhatsApp, Telegram, Discord, Skype, Signal, Zoom, etc.)
 */

// Outside chat / meeting invite patterns
const OUTSIDE_CHAT_PATTERNS = [
  // WhatsApp
  /(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\/[a-zA-Z0-9_\-+]+/gi,
  /whatsapp:\/\/[^\s]+/gi,

  // Telegram
  /(?:https?:\/\/)?(?:t\.me|telegram\.me|telegram\.dog)\/[a-zA-Z0-9_+]+/gi,

  // Discord
  /(?:https?:\/\/)?(?:discord\.gg|discord\.com\/invite)\/[a-zA-Z0-9_+]+/gi,

  // Skype
  /(?:https?:\/\/)?join\.skype\.com\/[a-zA-Z0-9_+]+/gi,
  /skype:[a-zA-Z0-9_.-]+/gi,

  // Signal
  /(?:https?:\/\/)?(?:signal\.me|signal\.group)\/[a-zA-Z0-9_+#-]+/gi,

  // WeChat
  /(?:weixin:\/\/|wechat:\/\/)[^\s]+/gi,

  // External meeting & video rooms
  /(?:https?:\/\/)?(?:zoom\.us\/j\/\d+|meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}|teams\.live\.com\/meet\/\d+)/gi,

  // Social DMs
  /(?:https?:\/\/)?(?:m\.me|facebook\.com\/messages\/t|instagram\.com\/direct\/t)\/[a-zA-Z0-9_.]+/gi,

  // Common URL shorteners frequently used to hide outside chat channels
  /(?:https?:\/\/)?(?:bit\.ly|tinyurl\.com|cutt\.ly|ow\.ly|is\.gd)\/[a-zA-Z0-9_-]+/gi,
];

// Email pattern (standard RFC compliant & common variations)
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;

// Obfuscated email pattern: user [at] domain [dot] com or user(at)domain(dot)com
const OBFUSCATED_EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+\s*(?:\[at\]|\(at\))\s*[A-Za-z0-9.-]+\s*(?:\[dot\]|\(dot\)|\.)\s*(?:com|org|net|io|co|ai|app|dev|edu|gov)\b/gi;

/**
 * Detects phone numbers with high accuracy, avoiding false positives on
 * version numbers (v4.18.2), error codes (0x80070005), port numbers (3000),
 * IP addresses (192.168.1.1), screen sizes (14-inch), and ticket refs (SIQ-1002).
 */
export function detectPhoneNumbers(text) {
  if (!text || typeof text !== "string") return [];
  const matches = [];

  // 1. Explicit phone intent keyword followed by digits:
  // e.g. "call me at 09171234567", "phone: +1 555-123-4567", "cell: 555.234.5678"
  const keywordRegex = /\b(?:call|phone|tel|cell|mobile|whatsapp|text me at|reach me at|contact me at)[:\s]+(?:\+?\d[\d\s\-().]{6,}\d)\b/gi;
  let match;
  while ((match = keywordRegex.exec(text)) !== null) {
    const raw = match[0].trim();
    // Verify it contains at least 7 digits
    const digitsOnly = raw.replace(/\D/g, "");
    if (digitsOnly.length >= 7 && digitsOnly.length <= 15) {
      matches.push(raw);
    }
  }

  // 2. International phone numbers starting with + or 00:
  // e.g. "+1 555-123-4567", "+44 20 7946 0958", "+63 917 123 4567"
  const intlRegex = /(?<![0-9a-zA-Z])(?:\+|00)[1-9]\d{0,2}[-.\s]+(?:\(?\d{1,4}\)?[-.\s]+)?\d{3,4}[-.\s]+\d{3,4}\b/g;
  while ((match = intlRegex.exec(text)) !== null) {
    const val = match[0].trim();
    const digits = val.replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15 && !matches.includes(val)) {
      matches.push(val);
    }
  }

  // 3. Formatted national phone numbers:
  // e.g. "(555) 123-4567", "555-123-4567", "555.123.4567", "0917-123-4567"
  const nationalRegex = /(?<![0-9a-zA-Z#xX])(?:\(\d{3}\)[-.\s]+|\b\d{3,4}[-.\s]+)\d{3,4}[-.\s]+\d{4}\b/g;
  while ((match = nationalRegex.exec(text)) !== null) {
    const val = match[0].trim();
    // Ensure not an IP address (e.g. 192.168.1.1)
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(val)) {
      const digits = val.replace(/\D/g, "");
      if (digits.length >= 7 && digits.length <= 14 && !matches.includes(val)) {
        matches.push(val);
      }
    }
  }

  return matches;
}

/**
 * Detects outside chat & meeting links
 */
export function detectOutsideChatLinks(text) {
  if (!text || typeof text !== "string") return [];
  const matches = [];

  for (const pattern of OUTSIDE_CHAT_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, "gi");
    while ((match = regex.exec(text)) !== null) {
      const val = match[0].trim();
      if (!matches.includes(val)) {
        matches.push(val);
      }
    }
  }

  return matches;
}

/**
 * Detects email addresses
 */
export function detectEmails(text) {
  if (!text || typeof text !== "string") return [];
  const matches = [];

  let match;
  const standardRegex = new RegExp(EMAIL_PATTERN.source, "gi");
  while ((match = standardRegex.exec(text)) !== null) {
    const val = match[0].trim();
    if (!matches.includes(val)) {
      matches.push(val);
    }
  }

  const obfRegex = new RegExp(OBFUSCATED_EMAIL_PATTERN.source, "gi");
  while ((match = obfRegex.exec(text)) !== null) {
    const val = match[0].trim();
    if (!matches.includes(val)) {
      matches.push(val);
    }
  }

  return matches;
}

/**
 * Inspect a message text and return whether it is flagged, along with details.
 */
export function inspectMessage(text) {
  if (!text || typeof text !== "string") {
    return {
      isFlagged: false,
      reasons: [],
      reasonText: null,
      summary: null,
      details: { phoneNumbers: [], emails: [], outsideChatLinks: [] },
    };
  }

  const phoneNumbers = detectPhoneNumbers(text);
  const emails = detectEmails(text);
  const outsideChatLinks = detectOutsideChatLinks(text);

  const reasons = [];
  const reasonLabels = [];

  if (phoneNumbers.length > 0) {
    reasons.push("phone_number");
    reasonLabels.push("phone number");
  }
  if (emails.length > 0) {
    reasons.push("email");
    reasonLabels.push("email address");
  }
  if (outsideChatLinks.length > 0) {
    reasons.push("outside_chat_link");
    reasonLabels.push("outside chat link");
  }

  const isFlagged = reasons.length > 0;
  const reasonText = isFlagged
    ? `Attempt to share off-platform contact (${reasonLabels.join(", ")})`
    : null;
  const summary = isFlagged
    ? `Flagged: Message contains ${reasonLabels.join(", ")}. Communications should remain inside SupportIQ for security and service tracking.`
    : null;

  return {
    isFlagged,
    reasons,
    reasonLabels,
    reasonText,
    summary,
    details: {
      phoneNumbers,
      emails,
      outsideChatLinks,
    },
  };
}

