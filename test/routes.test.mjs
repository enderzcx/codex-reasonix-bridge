import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMode, normalizeModelId, resolveRoute, routeMetadata } from "../src/routes.mjs";
import { buildSystemPrompt, buildUserPrompt } from "../src/prompts.mjs";
import { parseDelegateArgs, wrapJsonOutput } from "../src/cli.mjs";

test("normalizes review modes and DeepSeek aliases", () => {
  assert.equal(normalizeMode("review"), "final-review");
  assert.equal(normalizeMode("eng-plan"), "engineering-plan");
  assert.equal(normalizeModelId("v4-pro"), "deepseek-v4-pro:cloud");
  assert.equal(normalizeModelId("deepseek-v4-flash"), "deepseek-v4-flash:cloud");
});

test("routes review and engineering judgment to DeepSeek v4 Pro", () => {
  assert.equal(resolveRoute({ mode: "engineering-feedback" }).model, "deepseek-v4-pro:cloud");
  assert.equal(resolveRoute({ mode: "engineering-plan" }).model, "deepseek-v4-pro:cloud");
  assert.equal(resolveRoute({ mode: "daily-review" }).model, "deepseek-v4-pro:cloud");
  assert.equal(resolveRoute({ mode: "final-review" }).model, "deepseek-v4-pro:cloud");
});

test("rejects MiMo-owned modes after split", () => {
  assert.throws(() => normalizeMode("copywrite"), /unsupported delegate mode/);
  assert.throws(() => normalizeMode("frontend-first-pass"), /unsupported delegate mode/);
});

test("falls back to available review models when provided", () => {
  const route = resolveRoute({
    mode: "final-review",
    availableModels: ["deepseek-v4-flash:cloud"],
  });
  assert.equal(route.model, "deepseek-v4-flash:cloud");
  assert.equal(route.selection, "fallback");
});

test("system prompt keeps bridge in reviewer role", () => {
  const prompt = buildSystemPrompt("final-review", true);
  assert.match(prompt, /Codex is the engineering executor/);
  assert.match(prompt, /Do not produce unconditional patches/);
  assert.match(prompt, /codex-mimo-skill/);
  assert.match(prompt, /Return ONLY a valid JSON object/);
});

test("user prompt includes context and attached files", () => {
  const prompt = buildUserPrompt({
    task: "review landing implementation",
    contexts: ["audience: Chinese builders"],
    files: [{ path: "/tmp/a.diff", content: "diff", truncated: false }],
  });
  assert.match(prompt, /review landing implementation/);
  assert.match(prompt, /Chinese builders/);
  assert.match(prompt, /--- \/tmp\/a.diff ---/);
});

test("wraps non-json output in stable JSON", () => {
  const route = resolveRoute({ mode: "final-review" });
  const wrapped = wrapJsonOutput("hello", "final-review", routeMetadata(route));
  assert.equal(wrapped.mode, "final-review");
  assert.equal(wrapped.routing.provider, "reasonix");
  assert.equal(wrapped.deliverables[0].content, "hello");
});

test("parses background and timeout delegate controls", () => {
  const opts = parseDelegateArgs(["--background", "--timeout-ms", "0", "--mode", "final-review", "review this"]);
  assert.equal(opts.background, true);
  assert.equal(opts.timeoutMs, 0);
  assert.equal(opts.mode, "final-review");
  assert.equal(opts.task, "review this");
});
