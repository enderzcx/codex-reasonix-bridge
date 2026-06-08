---
name: codex-reasonix
description: Use when Codex needs Reasonix / DeepSeek v4 Pro for engineering consultation, second opinions, plan review, git diff review, daily review, final judgment, or compact review of a large current repo diff. Not for copywriting, UI taste, frontend first-pass, browsing, local file inspection without attached evidence, or replacing Codex's own verification.
---

# codex-reasonix

Use this skill when Codex needs Reasonix / DeepSeek v4 Pro as an external engineering collaborator:

- discuss an engineering problem without forcing a review schema
- review a Codex implementation plan
- review a diff for bugs, regressions, or missing tests
- get a second opinion on a root-cause hypothesis
- ask for final judgment before a risky merge
- summarize risks, rollback points, and verification gaps

For copy, Chinese expression, UI/UX taste, visual briefs, human feedback, or frontend first-pass work, use `codex-mimo` instead. MiMo no longer belongs in this Reasonix bridge.

Companion docs in this skill:

- [runtime.md](runtime.md): exact command/runtime rules
- [result-handling.md](result-handling.md): how to relay rendered/raw output
- [prompt-templates.md](prompt-templates.md): safe delegation prompt templates

## Command

Runtime source of truth:

- Prefer the official Go `DeepSeek-Reasonix` `main-v2` native `reasonix delegate` runtime.
- Treat the old TypeScript `DeepSeek-Reasonix` `main` / `v1` delegate overlay as legacy/local compatibility only.
- `crb delegate`, `crb consult`, and `crb review` should wrap `reasonix delegate`; they must not depend on `reasonix run` for review/delegation.
- `reasonix delegate` is a one-shot provider call: it does not enter the full Reasonix agent loop, does not edit files, and only sees task text, `--context`, and `--input` material attached by Codex.

Prefer:

```bash
crb consult --json "<question>"
codex-reasonix-bridge delegate --mode <mode> --json "<task>"
```

Short alias:

```bash
crb delegate --mode <mode> --json "<task>"
```

Use `consult` / `ask` for pure discussion:

```bash
crb consult --json "这个 auth 方案应该走 session 还是 JWT？请给取舍和下一步建议"
crb ask --json "这个 API 错误处理怎么收敛更合理？"
```

Attach files:

```bash
git diff > /tmp/change.diff
codex-reasonix-bridge delegate --mode final-review --json \
  --input /tmp/change.diff \
  "从 blocker、风险、测试缺口角度审这个改动"
```

For current repo diffs, prefer the codex-plugin-cc-style review command:

```bash
crb review --background --json "重点看 schema/migration/rollback 风险"
```

It collects git status, diff, and small untracked text files before calling Reasonix, so the reviewer gets explicit evidence instead of trying to inspect local paths.

For large current diffs, use compact review:

```bash
crb review --compact --background --json "只看 blocker/high 和必须补的验证"
```

`crb review` now auto-compacts when full git context exceeds the byte cap. `--compact` forces compact context immediately: diff stat, changed files, name-status, and zero-context hunks, with a clear instruction for Reasonix to request exact files or full hunks when needed.

## Modes

- `consult`: pure Codex <-> Reasonix discussion, second opinion, and focused delegation without forcing review schema
- `engineering-feedback`: DeepSeek v4 Pro second opinion on Codex's engineering plan or diff
- `engineering-plan`: DeepSeek v4 Pro review of Codex's implementation plan and verification strategy
- `daily-review`: DeepSeek v4 Pro daily second opinion
- `final-review`: high-confidence final judgment
- `adversarial-review`: focused challenge review for wrong assumptions, hidden risks, counterexamples, rollback gaps, and missing verification
- `general`: low-cost mixed Reasonix consultation fallback

## Long Tasks

When a consult or review task may take a long time, use a background job so the Codex session is not blocked.

Start:

```bash
crb consult --background --json "商量一下这个多 agent 协作协议怎么收敛"
crb delegate --mode final-review --background --json "审一下这个大型变更"
```

Manage:

- `crb status`: view job status
- `crb result <job-id>`: get the rendered result
- `crb result --json <job-id>`: get the full job record, including `result`, `rendered`, `raw`, and errors
- `crb cancel <job-id>`: cancel the job

Foreground mode has a default timeout of 180000ms and is best for quick consult/review. Background mode defaults to no timeout unless `--timeout-ms` is explicitly passed. For `consult`, `final-review`, or any large G2/G3 review, prefer `--background`.

## Input Boundary

Reasonix / DeepSeek does not have Codex's local tools or workspace runtime inside this bridge call. It cannot read local paths, nowledge-mem, shell output, browser state, or hidden files unless Codex attaches them.

For code, schema, architecture, or PR review, attach the actual material:

```bash
git diff > /tmp/change.diff
crb delegate --mode final-review --background --json \
  --input /tmp/change.diff \
  "审 blocker/high risk/missing tests；输入不够就标 [NEEDS_INPUT]"
```

For current git changes, use:

```bash
crb review --background --json "审 blocker/high risk/missing tests"
```

If the result says `[NEEDS_INPUT]`, attach the requested file/diff/context and rerun. Do not ask Reasonix to inspect local paths directly.

`--json` results come from native `reasonix delegate`. The native runtime normalizes direct JSON, fenced JSON, mixed output, and raw fallback; the bridge preserves that normalized payload in background job records for debugging.

For `final-review`, `engineering-feedback`, `daily-review`, and `adversarial-review`, the structured result follows `schemas/review-output.schema.json`: `verdict`, `summary`, `findings[]`, and `next_steps[]`. If schema validation fails, the bridge must preserve and render raw model output instead of discarding it.

By default the bridge starts native `reasonix delegate` under a temporary HOME and only carries necessary API key / base URL env through. Review/delegation does not call `reasonix run` or enter the full Reasonix agent loop. Use `--no-isolate-runtime` only when explicitly debugging the full Reasonix environment. When debugging the runtime implementation itself, use the clean Go main-v2 worktree rather than the dirty legacy TypeScript worktree.

## Discipline

Reasonix output is consultation/review input, not an unconditional patch.

Codex must:

1. State which command and mode were called.
2. Read `crb result <job-id>` or the foreground JSON before summarizing.
3. Preserve blocker/high findings and `[NEEDS_INPUT]` requests; do not summarize them away.
4. Say what Codex applied or intentionally ignored.
5. Verify any code/UI changes itself.

If Reasonix cannot be called, state the exact command attempted and the error, then continue with Codex's own judgment instead of pretending Reasonix was consulted.
