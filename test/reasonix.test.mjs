import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_TIMEOUT_MS, resolveTimeoutMs, runReasonixDelegate } from "../src/reasonix.mjs";

test("resolveTimeoutMs uses default and validates explicit values", () => {
  assert.equal(resolveTimeoutMs(undefined), DEFAULT_TIMEOUT_MS);
  assert.equal(resolveTimeoutMs("0"), 0);
  assert.equal(resolveTimeoutMs("2500"), 2500);
  assert.throws(() => resolveTimeoutMs("-1"), /invalid Reasonix timeout/);
  assert.throws(() => resolveTimeoutMs("soon"), /invalid Reasonix timeout/);
});

test("runReasonixDelegate fails clearly when the child process times out", async () => {
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
    () => runReasonixDelegate({
      reasonixBin: fakeReasonix,
      mode: "final-review",
      model: "deepseek-v4-pro:cloud",
      task: "ping",
      timeoutMs: 30,
    }),
    /timed out after 30ms/,
  );
});

test("runReasonixDelegate uses native delegate and isolates HOME by default", async () => {
  const dir = mkdtempSync(join(tmpdir(), "crb-isolate-"));
  const fakeReasonix = join(dir, "reasonix");
  writeFileSync(
    fakeReasonix,
    `#!/usr/bin/env node
console.log(JSON.stringify({
  argv: process.argv.slice(2),
  home: process.env.HOME,
  userprofile: process.env.USERPROFILE
}));
`,
  );
  chmodSync(fakeReasonix, 0o755);

  const result = await runReasonixDelegate({
    reasonixBin: fakeReasonix,
    mode: "final-review",
    model: "deepseek-v4-pro:cloud",
    task: "ping",
    timeoutMs: 5000,
  });
  const payload = JSON.parse(result.stdout);
  assert.ok(payload.argv.includes("delegate"));
  assert.equal(payload.argv.includes("--mode"), false);
  assert.ok(payload.argv.includes("--context"));
  assert.ok(payload.argv.includes("crb delegate mode: final-review"));
  assert.equal(payload.argv.includes("run"), false);
  assert.equal(payload.argv.includes("--no-config"), false);
  assert.match(payload.home, /crb-reasonix-home-/);
  assert.equal(payload.home, payload.userprofile);
});

test("runReasonixDelegate passes --mode when the Reasonix CLI advertises support", async () => {
  const dir = mkdtempSync(join(tmpdir(), "crb-mode-supported-"));
  const fakeReasonix = join(dir, "reasonix");
  writeFileSync(
    fakeReasonix,
    `#!/usr/bin/env node
const argv = process.argv.slice(2);
if (argv.includes("--help")) {
  console.log("Usage: reasonix delegate [options]\\n  --mode <mode>");
  process.exit(0);
}
console.log(JSON.stringify({ argv }));
`,
  );
  chmodSync(fakeReasonix, 0o755);

  const result = await runReasonixDelegate({
    reasonixBin: fakeReasonix,
    mode: "final-review",
    model: "deepseek-v4-pro:cloud",
    task: "ping",
    timeoutMs: 5000,
  });
  const payload = JSON.parse(result.stdout);
  assert.ok(payload.argv.includes("--mode"));
  assert.ok(payload.argv.includes("final-review"));
});

test("runReasonixDelegate can opt out of isolated HOME", async () => {
  const dir = mkdtempSync(join(tmpdir(), "crb-no-isolate-"));
  const fakeReasonix = join(dir, "reasonix");
  writeFileSync(
    fakeReasonix,
    `#!/usr/bin/env node
console.log(JSON.stringify({ argv: process.argv.slice(2) }));
`,
  );
  chmodSync(fakeReasonix, 0o755);

  const result = await runReasonixDelegate({
    reasonixBin: fakeReasonix,
    mode: "final-review",
    model: "deepseek-v4-pro:cloud",
    task: "ping",
    timeoutMs: 5000,
    isolateRuntime: false,
  });
  const payload = JSON.parse(result.stdout);
  assert.ok(payload.argv.includes("delegate"));
  assert.equal(payload.argv.includes("run"), false);
  assert.equal(payload.argv.includes("--no-config"), false);
});
