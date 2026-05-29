import assert from "node:assert/strict";
import test from "node:test";
import { isStructuredReviewMode, validateReviewOutput } from "../src/review-schema.mjs";

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

test("marks only review modes as structured", () => {
  assert.equal(isStructuredReviewMode("final-review"), true);
  assert.equal(isStructuredReviewMode("adversarial-review"), true);
  assert.equal(isStructuredReviewMode("engineering-plan"), false);
});
