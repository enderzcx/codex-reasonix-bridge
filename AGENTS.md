# AGENTS.md

## Project

`codex-reasonix-bridge` is an external Codex-first bridge for Reasonix.

It exists because Reasonix upstream wants core to remain DeepSeek-first,
cache-first, and single-model-loop oriented. This bridge keeps Codex-specific
DeepSeek review workflow outside core.

## Working Rules

- Keep the bridge external. Do not vendor or fork Reasonix core.
- Prefer stable `reasonix run` as the execution boundary.
- Reasonix-side models may produce engineering reviews, risk notes, plans, and final judgment.
- Codex remains the only engineering executor and final code reviewer.
- Add modes only when they map to a real Codex workflow.
- Avoid product claims that imply official Reasonix ownership.
- Do not add MiMo, copywriting, UI/UX, human-feedback, or frontend-first-pass routing here.
- MiMo work belongs in the sibling repo `codex-mimo-skill`.
- DeepSeek v4 Pro owns engineering/final review here.
- Follow the `openai/codex-plugin-cc` pattern for long review: use tracked background jobs instead of blocking the main session.
- Use `crb delegate --mode final-review --background --json "<task>"` for non-trivial G2/G3 review, large diffs, schema review, or architecture review.
- Manage background jobs with `crb status <job-id>`, `crb result <job-id>`, and `crb cancel <job-id>`.
- Foreground Reasonix calls have a 180000ms default timeout and should be used only for quick checks.
- Reasonix cannot read Codex's local workspace, nowledge-mem, browser, shell, or hidden runtime through this bridge. Always attach the actual diff/schema/file/plan with `--input` or inline context.
- For current repo code review, prefer `crb review --background --json "<focus>"`; it follows `openai/codex-plugin-cc` by collecting the git review target before calling the model.
- If a reviewer needs missing material, it must say `[NEEDS_INPUT]`; do not design prompts that tell Reasonix to inspect local paths directly.
- `--json` output may contain Reasonix logs or fenced JSON. The bridge must extract structured JSON robustly while preserving raw output in background job records.
- Default Reasonix calls must isolate runtime with temporary HOME + `reasonix run --no-config`; only pass `--no-isolate-runtime` for explicit debugging.

## Verification

Run:

```bash
npm test
npm run smoke
```

`npm run smoke` is a dry-run and should not call paid models.

For live model verification, use a short prompt:

```bash
codex-reasonix-bridge delegate --mode final-review --json "审一下这个方案有没有明显风险"
```

For live background verification:

```bash
crb delegate --mode final-review --background --json "只回复 ok"
crb status <job-id>
crb result <job-id>
```

## Upstream Discipline

If a change is useful to Reasonix without Codex-specific routing, consider a
small upstream PR. If it adds Codex protocol, model role routing, or Chinese
developer workflow policy, keep it in this repo.
