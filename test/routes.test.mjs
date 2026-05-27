import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMode, normalizeModelId, resolveRoute, routeMetadata } from "../src/routes.mjs";
import { buildSystemPrompt, buildUserPrompt } from "../src/prompts.mjs";
import { wrapJsonOutput } from "../src/cli.mjs";

test("normalizes mode and model aliases", () => {
  assert.equal(normalizeMode("copywriting"), "copywrite");
  assert.equal(normalizeMode("uiux"), "frontend-ux-plan");
  assert.equal(normalizeModelId("qwen3.5:397b"), "qwen3.5:cloud");
  assert.equal(normalizeModelId("kimi2.6"), "kimi-k2.6:cloud");
});

test("routes copy, human feedback, and engineering feedback to role models", () => {
  assert.equal(resolveRoute({ mode: "copywrite" }).model, "qwen3.5:cloud");
  assert.equal(resolveRoute({ mode: "human-feedback" }).model, "kimi-k2.6:cloud");
  assert.equal(resolveRoute({ mode: "engineering-feedback" }).model, "glm-5.1:cloud");
});

test("falls back to available models when provided", () => {
  const route = resolveRoute({
    mode: "visual-brief",
    availableModels: ["deepseek-v4-pro:cloud"],
  });
  assert.equal(route.model, "deepseek-v4-pro:cloud");
  assert.equal(route.selection, "fallback");
});

test("system prompt forbids bridge from claiming code execution", () => {
  const prompt = buildSystemPrompt("visual-brief", true);
  assert.match(prompt, /Codex is the engineering executor/);
  assert.match(prompt, /Do not produce unconditional patches/);
  assert.match(prompt, /Return ONLY a valid JSON object/);
});

test("user prompt includes context and attached files", () => {
  const prompt = buildUserPrompt({
    task: "review landing copy",
    contexts: ["audience: Chinese builders"],
    files: [{ path: "/tmp/a.md", content: "Hero", truncated: false }],
  });
  assert.match(prompt, /review landing copy/);
  assert.match(prompt, /Chinese builders/);
  assert.match(prompt, /--- \/tmp\/a.md ---/);
});

test("wraps non-json output in stable JSON", () => {
  const route = resolveRoute({ mode: "copywrite" });
  const wrapped = wrapJsonOutput("hello", "copywrite", routeMetadata(route));
  assert.equal(wrapped.mode, "copywrite");
  assert.equal(wrapped.deliverables[0].content, "hello");
});
