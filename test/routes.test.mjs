import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMode, normalizeModelId, resolveRoute, routeMetadata } from "../src/routes.mjs";
import { buildSystemPrompt, buildUserPrompt } from "../src/prompts.mjs";
import { parseDelegateArgs, parseReviewArgs, wrapJsonOutput } from "../src/cli.mjs";

test("normalizes review modes and DeepSeek aliases", () => {
  assert.equal(normalizeMode("ask"), "consult");
  assert.equal(normalizeMode("chat"), "consult");
  assert.equal(normalizeMode("rescue"), "consult");
  assert.equal(normalizeMode("review"), "final-review");
  assert.equal(normalizeMode("challenge"), "adversarial-review");
  assert.equal(normalizeMode("eng-plan"), "engineering-plan");
  assert.equal(normalizeModelId("v4-pro"), "deepseek-v4-pro:cloud");
  assert.equal(normalizeModelId("deepseek-v4-flash"), "deepseek-v4-flash:cloud");
});

test("routes pure consultation to DeepSeek v4 Pro without review schema", () => {
  const route = resolveRoute({ mode: "consult" });
  assert.equal(route.model, "deepseek-v4-pro:cloud");
  assert.equal(route.outputKind, "discussion");
  assert.equal(routeMetadata(route).output_kind, "discussion");
});

test("routes review and engineering judgment to DeepSeek v4 Pro", () => {
  assert.equal(resolveRoute({ mode: "engineering-feedback" }).model, "deepseek-v4-pro:cloud");
  assert.equal(resolveRoute({ mode: "engineering-plan" }).model, "deepseek-v4-pro:cloud");
  assert.equal(resolveRoute({ mode: "daily-review" }).model, "deepseek-v4-pro:cloud");
  assert.equal(resolveRoute({ mode: "final-review" }).model, "deepseek-v4-pro:cloud");
  assert.equal(resolveRoute({ mode: "adversarial-review" }).model, "deepseek-v4-pro:cloud");
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
  assert.match(prompt, /do not have access to Codex's local filesystem/);
  assert.match(prompt, /nowledge-mem/);
  assert.match(prompt, /Do not produce unconditional patches/);
  assert.match(prompt, /codex-mimo-skill/);
  assert.match(prompt, /Return ONLY a valid JSON object/);
  assert.match(prompt, /"verdict": "approve\|needs-attention"/);
  assert.match(prompt, /"findings"/);
});

test("consult prompt supports discussion without forcing review schema", () => {
  const prompt = buildSystemPrompt("consult", true);
  assert.match(prompt, /工程咨询/);
  assert.match(prompt, /discussion\|review\|plan\|note/);
  assert.match(prompt, /Codex is the engineering executor/);
  assert.match(prompt, /Use only the task/);
  assert.doesNotMatch(prompt, /"verdict": "approve\|needs-attention"/);
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
  assert.match(prompt, /cannot access local files/);
  assert.match(prompt, /\[NEEDS_INPUT\]/);
});

test("wraps non-json output in stable JSON", () => {
  const route = resolveRoute({ mode: "final-review" });
  const wrapped = wrapJsonOutput("hello", "final-review", routeMetadata(route));
  assert.equal(wrapped.mode, "final-review");
  assert.equal(wrapped.routing.provider, "reasonix");
  assert.equal(wrapped.parse_status, "raw-fallback");
  assert.equal(wrapped.deliverables[0].content, "hello");
});

test("extracts fenced JSON from mixed Reasonix output", () => {
  const route = resolveRoute({ mode: "final-review" });
  const wrapped = wrapJsonOutput(
    [
      "Queued final-review with deepseek-v4-pro:cloud",
      "Worker completed",
      "```json",
      JSON.stringify({
        verdict: "needs-attention",
        summary: "schema review found one blocker",
        findings: [{
          severity: "blocker",
          title: "Missing FK",
          body: "migration omits relation constraint",
          file: "schema.prisma",
          line_start: 12,
          line_end: 12,
          confidence: "high",
          recommendation: "add relation constraint",
        }],
        next_steps: ["attach migration diff"],
      }),
      "```",
    ].join("\n"),
    "final-review",
    routeMetadata(route),
  );
  assert.equal(wrapped.summary, "schema review found one blocker");
  assert.equal(wrapped.parse_status, "extracted");
  assert.equal(wrapped.parse_source, "fenced");
  assert.equal(wrapped.findings[0].title, "Missing FK");
  assert.match(wrapped.notes.at(-1), /extracted structured JSON/);
});

test("extracts best balanced JSON object from noisy logs", () => {
  const route = resolveRoute({ mode: "final-review" });
  const wrapped = wrapJsonOutput(
    [
      '{"event":"worker-started"}',
      "DeepSeek review:",
      JSON.stringify({
        verdict: "approve",
        summary: "looks good",
        findings: [],
        next_steps: [],
      }),
      "done",
    ].join("\n"),
    "final-review",
    routeMetadata(route),
  );
  assert.equal(wrapped.summary, "looks good");
  assert.deepEqual(wrapped.next_steps, []);
});

test("preserves raw output when structured review JSON fails schema validation", () => {
  const route = resolveRoute({ mode: "final-review" });
  const wrapped = wrapJsonOutput(
    JSON.stringify({
      summary: "missing required fields",
      findings: [{ severity: "urgent" }],
      next_steps: [],
    }),
    "final-review",
    routeMetadata(route),
  );
  assert.equal(wrapped.parse_status, "schema-fallback");
  assert.match(wrapped.summary, /did not match the review schema/);
  assert.match(wrapped.notes.join("\n"), /verdict must be approve/);
  assert.match(wrapped.deliverables[0].content, /missing required fields/);
});

test("parses background and timeout delegate controls", () => {
  const opts = parseDelegateArgs(["--background", "--timeout-ms", "0", "--mode", "final-review", "review this"]);
  assert.equal(opts.background, true);
  assert.equal(opts.timeoutMs, 0);
  assert.equal(opts.mode, "final-review");
  assert.equal(opts.task, "review this");
});

test("parses git review controls", () => {
  const opts = parseReviewArgs(["--background", "--scope", "working-tree", "--base", "main", "--json", "focus on migrations"]);
  assert.equal(opts.background, true);
  assert.equal(opts.scope, "working-tree");
  assert.equal(opts.base, "main");
  assert.equal(opts.json, true);
  assert.equal(opts.mode, "final-review");
  assert.equal(opts.task, "focus on migrations");
});
