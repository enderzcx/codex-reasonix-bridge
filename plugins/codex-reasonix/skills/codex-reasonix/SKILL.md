---
name: codex-reasonix
description: Use when Codex needs Reasonix / DeepSeek V4 Flash formal (deepseek-v4-flash:0731-cloud) for engineering consultation, second opinions, plan review, git diff review, daily review, final judgment, or compact review of a large current repo diff. Prefer native reasonix_* MCP tools when installed as the codex-reasonix plugin. Not for copywriting, UI taste, frontend first-pass, browsing, local file inspection without attached evidence, or replacing Codex's own verification.
license: MIT
compatibility: Requires Reasonix CLI, Ollama cloud credentials (OLLAMA_API_KEY), Node 20+, and crb / codex-reasonix-bridge. Default model is deepseek-v4-flash:0731-cloud.
metadata:
  short-description: DeepSeek Flash formal review bridge for Codex
  sunny_skill_type: wrapper
  agent_plugins: "1.0.0"
---

# codex-reasonix

Use Reasonix as an external engineering collaborator. **Default model is DeepSeek V4 Flash formal (`deepseek-v4-flash:0731-cloud`)**, preferred over Pro preview for review quality. Codex keeps scope, verification, integration, and final judgment.

## Prefer MCP when available

If `reasonix_*` MCP tools are visible in this session (Codex plugin install), use them first:

| Tool | Use |
|---|---|
| `reasonix_setup` | Environment / routing check |
| `reasonix_consult` | Second opinion / tradeoff discussion |
| `reasonix_review` | Git-context engineering review |
| `reasonix_delegate` | Explicit mode delegate |
| `reasonix_status` | Job list / inspect |
| `reasonix_result` | Finished job payload |
| `reasonix_cancel` | Cancel active job |
| `reasonix_models` | Model catalog |

MCP call rules:

1. Always pass absolute workspace `cwd`.
2. For non-trivial consult/review, use `background: true` (default), then `reasonix_status` / `reasonix_result`.
3. Do not invent local file access for Reasonix. Attach evidence via git review collection or CLI `--input`.
4. Default model is Flash formal 0731. Only set `model: deepseek-v4-pro` for explicit Pro preview contrast.

## CLI fallback

If MCP tools are not loaded, use the bridge CLI:

```bash
crb consult --json "<question>"
crb review --background --json "<focus>"
crb review --compact --background --json "<focus for large diffs>"
crb delegate --mode final-review --background --json "<task>"
crb status <job-id>
crb result <job-id>
crb result --json <job-id>
crb cancel <job-id>
```

`crb` calls native `reasonix delegate` (Go `DeepSeek-Reasonix` `main-v2` one-shot provider call). The old TypeScript `DeepSeek-Reasonix` `main` / `v1` path is legacy. Review/delegation does not enter the full Reasonix agent loop and cannot edit host files by itself.

Do not ask Reasonix to inspect local paths directly. If schema validation fails after normalization, preserve raw model output instead of discarding it.

## Models

- **Primary**: `deepseek-v4-flash:0731-cloud` (Flash formal; all modes default here)
- **Optional fallback / contrast**: `deepseek-v4-pro` (Pro preview; explicit `--model` / MCP `model` only)
- Host final judgment stays with Codex

## Modes

- `consult`: discussion / second opinion without forcing review schema
- `engineering-feedback`: second opinion on plan or diff
- `engineering-plan`: plan / verification strategy review
- `daily-review`: daily second opinion
- `final-review`: high-confidence judgment
- `adversarial-review`: challenge assumptions, rollback gaps, missing verification
- `general`: mixed consultation (same Flash primary)

## Input boundary

Reasonix only sees task text, `--context`, and attached inputs collected by `crb review` or `--input`.

If output says `[NEEDS_INPUT]`, attach the requested material and rerun. Do not ask Reasonix to open arbitrary local paths.

## Result handling

1. State which tool/command and mode were used.
2. Preserve blocker/high findings and `[NEEDS_INPUT]`.
3. Say what Codex applied or intentionally ignored.
4. Verify any code changes with host tools/tests.
5. Do not auto-patch merely because Reasonix returned findings.

Structured review modes follow `schemas/review-output.schema.json` when JSON is available: `verdict`, `summary`, `findings[]`, `next_steps[]`.

## Companion files

- [runtime.md](runtime.md)
- [result-handling.md](result-handling.md)
- [prompt-templates.md](prompt-templates.md)
