import assert from "node:assert/strict";
import test from "node:test";
import { isStructuredReviewMode, normalizeReviewOutput, validateReviewOutput } from "../src/review-schema.mjs";

test("validates structured review output", () => {
  const result = validateReviewOutput({
    verdict: "needs-attention",
    summary: "one issue",
    findings: [{
      severity: "high",
      title: "Risk",
      body: "evidence",
      file: "src/app.ts",
      line_start: 10,
      line_end: 12,
      confidence: "medium",
      recommendation: "fix it",
    }],
    next_steps: ["patch"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.findings[0].file, "src/app.ts");
});

test("rejects invalid structured review output", () => {
  const result = validateReviewOutput({
    verdict: "maybe",
    summary: "",
    findings: [{ severity: "urgent", confidence: "certain" }],
    next_steps: [""],
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /verdict must be approve/);
  assert.match(result.errors.join("\n"), /findings\[0\]\.severity/);
});

test("normalizes legacy Reasonix review payloads", () => {
  const result = normalizeReviewOutput({
    mode: "final-review",
    routing: { selected_model: "deepseek-v4-pro:cloud" },
    summary: "review found one missing test",
    deliverables: [{
      type: "review",
      title: "Missing smoke coverage",
      content: "The bridge should fix the schema fallback and add a missing test.",
    }],
    notes: [],
    next_for_codex: ["add a regression test"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.normalized, true);
  assert.equal(result.value.verdict, "needs-attention");
  assert.equal(result.value.findings[0].severity, "medium");
  assert.equal(result.value.findings[0].title, "Missing smoke coverage");
  assert.equal(result.value.next_steps[0], "add a regression test");
});

test("does not normalize schema-valid review payloads with extra legacy metadata", () => {
  const result = normalizeReviewOutput({
    verdict: "approve",
    summary: "valid review schema wins",
    findings: [],
    next_steps: [],
    deliverables: [{ type: "note", title: "Metadata", content: "extra data" }],
    next_for_codex: ["metadata hint"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.normalized, false);
  assert.deepEqual(result.value.findings, []);
  assert.deepEqual(result.value.next_steps, []);
});

test("normalizes issue-free legacy review payloads as approve", () => {
  const result = normalizeReviewOutput({
    summary: "no concrete issues found",
    deliverables: [{ type: "review", title: "Review", content: "Looks ready from the provided input." }],
    next_for_codex: [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.verdict, "approve");
  assert.equal(result.value.findings[0].severity, "info");
});

test("does not infer blocker from negated no blocker review text", () => {
  const result = normalizeReviewOutput({
    summary: "Approve: no blocker/high risks found.",
    deliverables: [{
      type: "review",
      title: "Overall assessment",
      content: "Approve: no blocker/high risks found. No correctness or security issues identified.",
    }],
    next_for_codex: ["safe to push"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.verdict, "approve");
  assert.equal(result.value.findings[0].severity, "info");
});

test("does not infer blocker from negated blocker title", () => {
  const result = normalizeReviewOutput({
    summary: "Approve: no blocker found.",
    deliverables: [{
      type: "review",
      title: "No blocker found",
      content: "All clear from the provided input.",
    }],
    next_for_codex: [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.verdict, "approve");
  assert.equal(result.value.findings[0].severity, "info");
});

test("keeps valid deliverables when a legacy payload also has invalid entries", () => {
  const result = normalizeReviewOutput({
    summary: "partial legacy review",
    deliverables: [
      null,
      { type: "review", title: "Missing edge case", content: "One compatibility edge case needs coverage." },
    ],
    next_for_codex: ["add edge case coverage"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.verdict, "needs-attention");
  assert.equal(result.value.findings.length, 1);
  assert.equal(result.value.findings[0].title, "Missing edge case");
});

test("rejects malformed legacy review payloads instead of normalizing to approve", () => {
  const result = normalizeReviewOutput({
    summary: "legacy payload is malformed",
    deliverables: [null],
    next_for_codex: [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.normalized, false);
  assert.match(result.errors.join("\n"), /verdict must be approve/);
});

test("marks only review modes as structured", () => {
  assert.equal(isStructuredReviewMode("final-review"), true);
  assert.equal(isStructuredReviewMode("adversarial-review"), true);
  assert.equal(isStructuredReviewMode("engineering-plan"), false);
});
