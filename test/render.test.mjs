import assert from "node:assert/strict";
import test from "node:test";
import { renderDelegateResult } from "../src/render.mjs";

test("renders parsed Reasonix payload as stable markdown", () => {
  const rendered = renderDelegateResult({
    mode: "final-review",
    verdict: "needs-attention",
    summary: "one blocker",
    findings: [{
      severity: "blocker",
      title: "Missing rollback",
      body: "migration has no rollback path",
      file: "migrations/001.sql",
      line_start: 8,
      line_end: 8,
      confidence: "high",
      recommendation: "add rollback plan",
    }],
    notes: ["attach migration"],
    next_steps: ["fix rollback path"],
  });

  assert.match(rendered, /# Reasonix result \(final-review\)/);
  assert.match(rendered, /Verdict: needs-attention/);
  assert.match(rendered, /## Findings/);
  assert.match(rendered, /BLOCKER: Missing rollback/);
  assert.match(rendered, /migrations\/001\.sql:8/);
  assert.match(rendered, /## Next For Codex/);
});

test("renders raw model output when JSON parsing failed", () => {
  const rendered = renderDelegateResult({
    mode: "final-review",
    parse_status: "raw-fallback",
    summary: "Delegate model returned non-JSON content.",
    deliverables: [{ type: "note", title: "raw", content: "plain text review" }],
  }, { raw: "plain text review" });

  assert.match(rendered, /Delegate model returned non-JSON content/);
  assert.match(rendered, /## Raw Model Output/);
  assert.match(rendered, /plain text review/);
});
