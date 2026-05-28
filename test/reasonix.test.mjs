import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_TIMEOUT_MS, resolveTimeoutMs, runReasonix } from "../src/reasonix.mjs";

test("resolveTimeoutMs uses default and validates explicit values", () => {
  assert.equal(resolveTimeoutMs(undefined), DEFAULT_TIMEOUT_MS);
  assert.equal(resolveTimeoutMs("0"), 0);
  assert.equal(resolveTimeoutMs("2500"), 2500);
  assert.throws(() => resolveTimeoutMs("-1"), /invalid Reasonix timeout/);
  assert.throws(() => resolveTimeoutMs("soon"), /invalid Reasonix timeout/);
});

test("runReasonix fails clearly when the child process times out", async () => {
  const dir = mkdtempSync(join(tmpdir(), "crb-timeout-"));
  const fakeReasonix = join(dir, "reasonix");
  writeFileSync(
    fakeReasonix,
    `#!/usr/bin/env node
setTimeout(() => {
  console.log("late");
}, 1000);
`,
  );
  chmodSync(fakeReasonix, 0o755);

  await assert.rejects(
    () => runReasonix({
      reasonixBin: fakeReasonix,
      model: "deepseek-v4-pro:cloud",
      prompt: "ping",
      timeoutMs: 30,
    }),
    /timed out after 30ms/,
  );
});
