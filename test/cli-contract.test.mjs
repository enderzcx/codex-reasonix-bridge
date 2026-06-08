import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync as run } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import test from "node:test";
import { createJob } from "../src/state.mjs";

const BIN = resolve("bin/codex-reasonix-bridge.mjs");

function writeFakeReasonix(path, body) {
  writeFileSync(
    path,
    `#!/usr/bin/env node
const argv = process.argv.slice(2);
if (!argv.includes("delegate")) {
  console.error("expected native reasonix delegate runtime, got: " + argv.join(" "));
  process.exit(64);
}
if (argv.includes("run")) {
  console.error("bridge must not call reasonix run for delegate/review");
  process.exit(65);
}
${body}
`,
  );
  chmodSync(path, 0o755);
}

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
  writeFakeReasonix(
    fakeReasonix,
    `console.log(JSON.stringify({
  verdict: "approve",
  summary: "ok",
  findings: [],
  next_steps: []
}));
`,
  );

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

test("foreground delegate does not leak crb --mode to Reasonix CLIs that do not support it", () => {
  const cwd = mkdtempSync(join(tmpdir(), "crb-mode-compat-contract-"));
  const fakeReasonix = join(cwd, "reasonix");
  writeFakeReasonix(
    fakeReasonix,
    `if (argv.includes("--mode")) {
  console.error("unknown flag: --mode");
  process.exit(67);
}
if (!argv.includes("--context") || !argv.includes("crb delegate mode: final-review")) {
  console.error("expected crb mode compatibility context");
  process.exit(68);
}
console.log(JSON.stringify({
  verdict: "approve",
  summary: "mode compat ok",
  findings: [],
  next_steps: []
}));
`,
  );

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
  assert.equal(payload.summary, "mode compat ok");
});

test("consult command defaults to discussion mode", () => {
  const cwd = mkdtempSync(join(tmpdir(), "crb-consult-contract-"));
  const fakeReasonix = join(cwd, "reasonix");
  writeFakeReasonix(
    fakeReasonix,
    `console.log(JSON.stringify({
  summary: "consulted",
  deliverables: [{ type: "discussion", title: "Answer", content: "talk it through" }],
  notes: [],
  next_for_codex: ["decide"]
}));
`,
  );

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
  writeFakeReasonix(
    fakeReasonix,
    `setTimeout(() => {
  console.log(JSON.stringify({ summary: "late", deliverables: [], notes: [], next_for_codex: [] }));
}, 1500);
`,
  );

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

test("review command invokes native reasonix delegate runtime", () => {
  const cwd = mkdtempSync(join(tmpdir(), "crb-review-native-contract-"));
  run("git", ["init"], { cwd, encoding: "utf8" });
  writeFileSync(join(cwd, "change.txt"), "review me\n");
  const fakeReasonix = join(cwd, "reasonix");
  writeFakeReasonix(
    fakeReasonix,
    `if (!argv.includes("--input")) {
  console.error("review must pass collected git context as --input");
  process.exit(66);
}
console.log(JSON.stringify({
  verdict: "approve",
  summary: "review ok",
  findings: [],
  next_steps: []
}));
`,
  );

  const output = run(process.execPath, [
    BIN,
    "review",
    "--scope",
    "working-tree",
    "--json",
    "--reasonix-bin",
    fakeReasonix,
    "focused review",
  ], { cwd, encoding: "utf8" });
  const payload = JSON.parse(output);
  assert.equal(payload.verdict, "approve");
  assert.equal(payload.summary, "review ok");
  assert.equal(payload.parse_status, "parsed");
});
