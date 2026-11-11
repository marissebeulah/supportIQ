import assert from "node:assert/strict";
import test from "node:test";
import { generateBotReply } from "../server/bot.js";

const settings = {
  bot_greeting: "Hello {first_name}, how can I help with your SupportIQ account?",
  bot_fallback: "I can help with SupportIQ support issues. Please create a request in the portal.",
  bot_escalation: "Create a SupportIQ request and the IT team will continue in this thread.",
  bot_guardrail: "I can only help with support issues.",
};

test("assistant refuses sales and promotional requests with support-only guidance", () => {
  const reply = generateBotReply({
    text: "Write promotional marketing copy for a discount offer",
    kb: [],
    settings,
  });

  assert.equal(reply.intent, "guardrail");
  assert.match(reply.body, /support issues/i);
  assert.doesNotMatch(reply.body, /discount|promo|marketing|sales/i);
});

test("unsafe managed knowledge answers are replaced before delivery", () => {
  const reply = generateBotReply({
    text: "How do I reset my password?",
    kb: [{
      id: 1,
      question: "How do I reset my password?",
      answer: "Buy now and get a limited-time discount: https://example.invalid",
      keywords: "password, reset",
      enabled: true,
    }],
    settings,
  });

  assert.equal(reply.intent, "fallback");
  assert.match(reply.body, /SupportIQ/);
  assert.doesNotMatch(reply.body, /buy now|discount|https?:\/\//i);
});

test("support knowledge remains available for customers", () => {
  const reply = generateBotReply({
    text: "How do I reset my password?",
    kb: [{
      id: 1,
      question: "How do I reset my password?",
      answer: "Use the SupportIQ sign-in page to reset your password. If it fails, create a request in the portal.",
      keywords: "password, reset",
      enabled: true,
    }],
    settings,
  });

  assert.equal(reply.intent, "answer");
  assert.match(reply.body, /reset your password/);
});

test("admin-configured greeting cannot send promotional copy or external links", () => {
  const reply = generateBotReply({
    text: "hello",
    kb: [],
    settings: {
      ...settings,
      bot_greeting: "Hello! Upgrade now at https://example.invalid",
    },
  });

  assert.equal(reply.intent, "fallback");
  assert.doesNotMatch(reply.body, /upgrade|https?:\/\//i);
});

test("assistant does not turn a matched but unrelated entry into a reply", () => {
  const reply = generateBotReply({
    text: "What are some fun weekend activities?",
    kb: [{
      id: 2,
      question: "What are some fun weekend activities?",
      answer: "Visit a new restaurant or go hiking.",
      keywords: "weekend, activities, fun",
      enabled: true,
    }],
    settings,
  });

  assert.equal(reply.intent, "fallback");
  assert.match(reply.body, /SupportIQ/);
});
