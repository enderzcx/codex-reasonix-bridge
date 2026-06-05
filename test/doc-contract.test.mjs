import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("README documents result rendering, raw fallback, schema, and adversarial review", () => {
  const readme = readFileSync("README.md", "utf8");
  assert.match(readme, /crb consult/);
  assert.match(readme, /单纯商量/);
  assert.match(readme, /crb result <job-id>/);
  assert.match(readme, /crb result --json <job-id>/);
  assert.match(readme, /crb review --compact/);
  assert.match(readme, /rendered/);
  assert.match(readme, /raw/);
  assert.match(readme, /schemas\/review-output\.schema\.json/);
  assert.match(readme, /adversarial-review/);
});

test("skill documents source-of-truth result handling", () => {
  const skill = readFileSync("skills/codex-reasonix/SKILL.md", "utf8");
  assert.match(skill, /crb consult/);
  assert.match(skill, /crb result <job-id>/);
  assert.match(skill, /crb result --json <job-id>/);
  assert.match(skill, /crb review --compact/);
  assert.match(skill, /raw model output/);
  assert.match(skill, /schema validation fails/);
  assert.match(skill, /Do not ask Reasonix to inspect local paths directly/);
  assert.match(skill, /runtime\.md/);
  assert.match(skill, /result-handling\.md/);
  assert.match(skill, /prompt-templates\.md/);
});

test("split skill docs keep runtime, result, and prompt concerns separate", () => {
  const runtime = readFileSync("skills/codex-reasonix/runtime.md", "utf8");
  const results = readFileSync("skills/codex-reasonix/result-handling.md", "utf8");
  const prompts = readFileSync("skills/codex-reasonix/prompt-templates.md", "utf8");
  assert.match(runtime, /crb delegate/);
  assert.match(runtime, /--compact/);
  assert.match(results, /source-of-truth/);
  assert.match(results, /raw-fallback|schema-fallback/);
  assert.match(prompts, /Adversarial review/);
});

test("AGENTS keeps plugin-cc-style background and result contract", () => {
  const agents = readFileSync("AGENTS.md", "utf8");
  assert.match(agents, /openai\/codex-plugin-cc/);
  assert.match(agents, /crb delegate --mode final-review --background --json/);
  assert.match(agents, /crb result --json <job-id>/);
  assert.match(agents, /schemas\/review-output\.schema\.json/);
});
