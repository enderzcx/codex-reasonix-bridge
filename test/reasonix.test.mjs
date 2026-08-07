import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_TIMEOUT_MS, prepareIsolatedReasonixHome, readReasonixCredentialEnv, resolveTimeoutMs, runReasonixDelegate } from "../src/reasonix.mjs";

test("resolveTimeoutMs uses default and validates explicit values", () => {
  assert.equal(resolveTimeoutMs(undefined), DEFAULT_TIMEOUT_MS);
  assert.equal(resolveTimeoutMs("0"), 0);
  assert.equal(resolveTimeoutMs("2500"), 2500);
  assert.throws(() => resolveTimeoutMs("-1"), /invalid Reasonix timeout/);
  assert.throws(() => resolveTimeoutMs("soon"), /invalid Reasonix timeout/);
});

test("readReasonixCredentialEnv carries Go Reasonix dotenv secrets into isolated runs", () => {
  const dir = mkdtempSync(join(tmpdir(), "crb-reasonix-home-source-"));
  mkdirSync(join(dir, ".reasonix"));
  writeFileSync(
    join(dir, ".reasonix", ".env"),
    [
      "DEEPSEEK_API_KEY=from-dotenv",
      "QUOTED_KEY=\"quoted value\"",
      "SINGLE_QUOTED='single quoted'",
      "# ignored",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(dir, ".reasonix", "config.json"),
    JSON.stringify({ apiKey: "legacy", baseUrl: "https://legacy.example", ollamaApiKey: "legacy-ollama" }),
  );

  const originalDeepSeek = process.env.DEEPSEEK_API_KEY;
  try {
    delete process.env.DEEPSEEK_API_KEY;
    const env = readReasonixCredentialEnv(dir);
    assert.equal(env.DEEPSEEK_API_KEY, "from-dotenv");
    assert.equal(env.DEEPSEEK_BASE_URL, "https://legacy.example");
    assert.equal(env.OLLAMA_API_KEY, "legacy-ollama");
    assert.equal(env.QUOTED_KEY, "quoted value");
    assert.equal(env.SINGLE_QUOTED, "single quoted");

    process.env.DEEPSEEK_API_KEY = "from-shell";
    assert.equal(readReasonixCredentialEnv(dir).DEEPSEEK_API_KEY, undefined);
  } finally {
    if (originalDeepSeek === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalDeepSeek;
  }
});

test("prepareIsolatedReasonixHome copies config and materializes credentials only", () => {
  const sourceHome = mkdtempSync(join(tmpdir(), "crb-reasonix-source-home-"));
  const isolatedHome = mkdtempSync(join(tmpdir(), "crb-reasonix-target-home-"));
  mkdirSync(join(sourceHome, ".reasonix"));
  writeFileSync(join(sourceHome, ".reasonix", "config.toml"), '[[providers]]\nname = "ollama-cloud"\napi_key_env = "OLLAMA_API_KEY"\n');
  writeFileSync(join(sourceHome, ".reasonix", ".env"), "OLLAMA_API_KEY=secret-token\nSPACED_KEY='two words'\n");
  mkdirSync(join(sourceHome, ".reasonix", "sessions"));
  writeFileSync(join(sourceHome, ".reasonix", "sessions", "ignored.jsonl"), "{}\n");

  prepareIsolatedReasonixHome(isolatedHome, sourceHome);

  assert.equal(readFileSync(join(isolatedHome, ".reasonix", "config.toml"), "utf8").includes("ollama-cloud"), true);
  const envText = readFileSync(join(isolatedHome, ".reasonix", ".env"), "utf8");
  assert.match(envText, /OLLAMA_API_KEY=secret-token/);
  assert.match(envText, /SPACED_KEY="two words"/);
  assert.equal(existsSync(join(isolatedHome, ".reasonix", "sessions", "ignored.jsonl")), false);
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

test("runReasonixDelegate pins the overlay CLI while HOME is isolated", async () => {
  const dir = mkdtempSync(join(tmpdir(), "crb-overlay-env-"));
  const fakeReasonix = join(dir, "reasonix");
  const fakeOverlay = join(dir, "overlay-index.js");
  writeFileSync(fakeOverlay, "");
  writeFileSync(
    fakeReasonix,
    `#!/usr/bin/env node
const argv = process.argv.slice(2);
if (argv.includes("--help")) {
  console.log("Usage: reasonix delegate [options]\\n  --mode <mode>");
  process.exit(0);
}
console.log(JSON.stringify({
  argv,
  home: process.env.HOME,
  bridgeCli: process.env.REASONIX_CODEX_BRIDGE_CLI
}));
`,
  );
  chmodSync(fakeReasonix, 0o755);

  const originalBridgeCli = process.env.REASONIX_CODEX_BRIDGE_CLI;
  process.env.REASONIX_CODEX_BRIDGE_CLI = fakeOverlay;
  try {
    const result = await runReasonixDelegate({
      reasonixBin: fakeReasonix,
      mode: "final-review",
      model: "deepseek-v4-pro:cloud",
      task: "ping",
      timeoutMs: 5000,
    });
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.bridgeCli, fakeOverlay);
    assert.match(payload.home, /crb-reasonix-home-/);
  } finally {
    if (originalBridgeCli === undefined) delete process.env.REASONIX_CODEX_BRIDGE_CLI;
    else process.env.REASONIX_CODEX_BRIDGE_CLI = originalBridgeCli;
  }
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
