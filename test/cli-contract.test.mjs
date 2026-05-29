import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync as run } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import test from "node:test";
import { createJob } from "../src/state.mjs";

const BIN = resolve("bin/codex-reasonix-bridge.mjs");

test("result command returns rendered output, not the full job JSON", () => {
  const cwd = mkdtempSync(join(tmpdir(), "crb-result-contract-"));
  createJob(cwd, {
    id: "review-rendered",
    kind: "delegate",
    title: "Reasonix final-review",
    status: "completed",
    summary: "done",
    result: { summary: "done" },
    rendered: "# Reasonix result\n\nrendered finding\n",
  });

  const output = run(process.execPath, [BIN, "result", "--cwd", cwd, "review-rendered"], { cwd, encoding: "utf8" });
  assert.equal(output, "# Reasonix result\n\nrendered finding\n");
});

test("result --json command returns the full job record", () => {
  const cwd = mkdtempSync(join(tmpdir(), "crb-result-json-contract-"));
  createJob(cwd, {
    id: "review-json",
    kind: "delegate",
    title: "Reasonix final-review",
    status: "completed",
    summary: "done",
    result: { summary: "done" },
    rendered: "# Reasonix result\n\nrendered finding\n",
    raw: "{\"summary\":\"done\"}",
  });

  const output = run(process.execPath, [BIN, "result", "--json", "--cwd", cwd, "review-json"], { cwd, encoding: "utf8" });
  const payload = JSON.parse(output);
  assert.equal(payload.id, "review-json");
  assert.equal(payload.status, "completed");
  assert.deepEqual(payload.result, { summary: "done" });
  assert.equal(payload.rendered, "# Reasonix result\n\nrendered finding\n");
  assert.equal(payload.raw, "{\"summary\":\"done\"}");
});

test("result command renders legacy jobs without a stored rendered field", () => {
  const cwd = mkdtempSync(join(tmpdir(), "crb-result-legacy-contract-"));
  createJob(cwd, {
    id: "review-legacy",
    kind: "delegate",
    title: "Reasonix legacy",
    status: "completed",
    summary: "legacy summary",
    result: {
      mode: "final-review",
      summary: "legacy summary",
      deliverables: [{ type: "review", title: "Legacy Finding", content: "old job still works" }],
      next_for_codex: ["keep compatibility"],
    },
  });

  const output = run(process.execPath, [BIN, "result", "--cwd", cwd, "review-legacy"], { cwd, encoding: "utf8" });
  assert.match(output, /# Reasonix result \(final-review\)/);
  assert.match(output, /Legacy Finding/);
  assert.match(output, /old job still works/);
});

test("foreground delegate --json keeps machine-readable JSON output", () => {
  const cwd = mkdtempSync(join(tmpdir(), "crb-foreground-json-contract-"));
  const fakeReasonix = join(cwd, "reasonix");
  writeFileSync(
    fakeReasonix,
    `#!/usr/bin/env node
console.log(JSON.stringify({
  verdict: "approve",
  summary: "ok",
  findings: [],
  next_steps: []
}));
`,
  );
  chmodSync(fakeReasonix, 0o755);

  const output = run(process.execPath, [
    BIN,
    "delegate",
    "--mode",
    "final-review",
    "--json",
    "--reasonix-bin",
    fakeReasonix,
    "quick review",
  ], { cwd, encoding: "utf8" });
  const payload = JSON.parse(output);
  assert.equal(payload.verdict, "approve");
  assert.equal(payload.summary, "ok");
  assert.equal(payload.parse_status, "parsed");
});

test("consult command defaults to discussion mode", () => {
  const cwd = mkdtempSync(join(tmpdir(), "crb-consult-contract-"));
  const fakeReasonix = join(cwd, "reasonix");
  writeFileSync(
    fakeReasonix,
    `#!/usr/bin/env node
console.log(JSON.stringify({
  summary: "consulted",
  deliverables: [{ type: "discussion", title: "Answer", content: "talk it through" }],
  notes: [],
  next_for_codex: ["decide"]
}));
`,
  );
  chmodSync(fakeReasonix, 0o755);

  const output = run(process.execPath, [
    BIN,
    "consult",
    "--json",
    "--reasonix-bin",
    fakeReasonix,
    "商量一下这个问题",
  ], { cwd, encoding: "utf8" });
  const payload = JSON.parse(output);
  assert.equal(payload.mode, "consult");
  assert.equal(payload.routing.output_kind, "discussion");
  assert.equal(payload.deliverables[0].type, "discussion");
});

test("background delegate returns a job id without waiting for the model", () => {
  const cwd = mkdtempSync(join(tmpdir(), "crb-background-contract-"));
  const fakeReasonix = join(cwd, "reasonix");
  writeFileSync(
    fakeReasonix,
    `#!/usr/bin/env node
setTimeout(() => {
  console.log(JSON.stringify({ summary: "late", deliverables: [], notes: [], next_for_codex: [] }));
}, 1500);
`,
  );
  chmodSync(fakeReasonix, 0o755);

  const started = Date.now();
  const output = run(process.execPath, [
    BIN,
    "delegate",
    "--mode",
    "final-review",
    "--background",
    "--json",
    "--reasonix-bin",
    fakeReasonix,
    "slow review",
  ], { cwd, encoding: "utf8" });
  const elapsed = Date.now() - started;
  const payload = JSON.parse(output);

  assert.equal(payload.status, "queued");
  assert.match(payload.job_id, /^review-/);
  assert.ok(elapsed < 1000, `background command waited ${elapsed}ms`);
});
