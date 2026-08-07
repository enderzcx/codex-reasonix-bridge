import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMode, normalizeModelId, resolveRoute, routeMetadata } from "../src/routes.mjs";
import { parseDelegateArgs, parseReviewArgs, wrapJsonOutput } from "../src/cli.mjs";

test("normalizes review modes and DeepSeek aliases", () => {
  assert.equal(normalizeMode("ask"), "consult");
  assert.equal(normalizeMode("chat"), "consult");
  assert.equal(normalizeMode("rescue"), "consult");
  assert.equal(normalizeMode("review"), "final-review");
  assert.equal(normalizeMode("challenge"), "adversarial-review");
  assert.equal(normalizeMode("eng-plan"), "engineering-plan");
  assert.equal(normalizeModelId("v4-pro"), "ollama-cloud/deepseek-v4-pro");
  assert.equal(normalizeModelId("deepseek-v4-pro:cloud"), "ollama-cloud/deepseek-v4-pro");
  assert.equal(normalizeModelId("deepseek-v4-flash"), "ollama-cloud/deepseek-v4-flash:0731-cloud");
  assert.equal(normalizeModelId("deepseek-v4-flash:0731-cloud"), "ollama-cloud/deepseek-v4-flash:0731-cloud");
  assert.equal(normalizeModelId("v4-pro"), "ollama-cloud/deepseek-v4-pro");
});

test("routes pure consultation to Flash formal (0731) without review schema", () => {
  const route = resolveRoute({ mode: "consult" });
  assert.equal(route.model, "ollama-cloud/deepseek-v4-flash:0731-cloud");
  assert.equal(route.outputKind, "discussion");
  assert.equal(routeMetadata(route).output_kind, "discussion");
});

test("routes review and engineering judgment to Flash formal (0731)", () => {
  assert.equal(resolveRoute({ mode: "engineering-feedback" }).model, "ollama-cloud/deepseek-v4-flash:0731-cloud");
  assert.equal(resolveRoute({ mode: "engineering-plan" }).model, "ollama-cloud/deepseek-v4-flash:0731-cloud");
  assert.equal(resolveRoute({ mode: "daily-review" }).model, "ollama-cloud/deepseek-v4-flash:0731-cloud");
  assert.equal(resolveRoute({ mode: "final-review" }).model, "ollama-cloud/deepseek-v4-flash:0731-cloud");
  assert.equal(resolveRoute({ mode: "adversarial-review" }).model, "ollama-cloud/deepseek-v4-flash:0731-cloud");
  assert.equal(resolveRoute({ mode: "general" }).model, "ollama-cloud/deepseek-v4-flash:0731-cloud");
});

test("rejects MiMo-owned modes after split", () => {
  assert.throws(() => normalizeMode("copywrite"), /unsupported delegate mode/);
  assert.throws(() => normalizeMode("frontend-first-pass"), /unsupported delegate mode/);
});

test("falls back to Pro preview when formal Flash is unavailable", () => {
  const route = resolveRoute({
    mode: "final-review",
    availableModels: ["deepseek-v4-pro:cloud"],
  });
  assert.equal(route.model, "ollama-cloud/deepseek-v4-pro");
  assert.equal(route.selection, "fallback");
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

test("normalizes legacy review JSON before schema fallback", () => {
  const route = resolveRoute({ mode: "final-review" });
  const wrapped = wrapJsonOutput(
    JSON.stringify({
      mode: "final-review",
      routing: { selected_model: "ollama-cloud/deepseek-v4-pro" },
      summary: "legacy shape from Reasonix",
      deliverables: [{
        type: "review",
        title: "Missing regression test",
        content: "The bridge has a test gap around legacy review JSON.",
      }],
      notes: [],
      next_for_codex: ["add coverage for deliverables + next_for_codex"],
    }),
    "final-review",
    routeMetadata(route),
  );

  assert.equal(wrapped.parse_status, "normalized");
  assert.equal(wrapped.verdict, "needs-attention");
  assert.equal(wrapped.findings[0].title, "Missing regression test");
  assert.deepEqual(wrapped.next_steps, ["add coverage for deliverables + next_for_codex"]);
  assert.match(wrapped.notes.join("\n"), /normalized legacy Reasonix review JSON/);
});

test("preserves raw output when malformed legacy review JSON cannot normalize", () => {
  const route = resolveRoute({ mode: "final-review" });
  const raw = JSON.stringify({
    summary: "malformed legacy review",
    deliverables: [null],
    next_for_codex: [],
  });
  const wrapped = wrapJsonOutput(raw, "final-review", routeMetadata(route));

  assert.equal(wrapped.parse_status, "schema-fallback");
  assert.match(wrapped.summary, /did not match the review schema/);
  assert.match(wrapped.deliverables[0].content, /malformed legacy review/);
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
  const opts = parseReviewArgs(["--background", "--scope", "working-tree", "--base", "main", "--compact", "--json", "focus on migrations"]);
  assert.equal(opts.background, true);
  assert.equal(opts.scope, "working-tree");
  assert.equal(opts.base, "main");
  assert.equal(opts.compact, true);
  assert.equal(opts.json, true);
  assert.equal(opts.mode, "final-review");
  assert.equal(opts.task, "focus on migrations");
});
