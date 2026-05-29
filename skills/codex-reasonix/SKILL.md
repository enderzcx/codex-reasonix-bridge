---
name: codex-reasonix
description: Use Reasonix / DeepSeek v4 Pro from Codex for engineering second opinions, plan review, daily review, and final judgment.
---

# codex-reasonix

Use this skill when Codex needs an external engineering reviewer:

- review a Codex implementation plan
- review a diff for bugs, regressions, or missing tests
- get a second opinion on a root-cause hypothesis
- ask for final judgment before a risky merge
- summarize risks, rollback points, and verification gaps

For copy, Chinese expression, UI/UX taste, visual briefs, human feedback, or frontend first-pass work, use `codex-mimo` instead. MiMo no longer belongs in this Reasonix bridge.

## Command

Prefer:

```bash
codex-reasonix-bridge delegate --mode <mode> --json "<task>"
```

Short alias:

```bash
crb delegate --mode <mode> --json "<task>"
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

## Modes

- `engineering-feedback`: DeepSeek v4 Pro second opinion on Codex's engineering plan or diff
- `engineering-plan`: DeepSeek v4 Pro review of Codex's implementation plan and verification strategy
- `daily-review`: DeepSeek v4 Pro daily second opinion
- `final-review`: high-confidence final judgment
- `general`: mixed Reasonix review fallback

## Long Reviews

When a review may take a long time, use a background job so the Codex session is not blocked.

Start:

```bash
crb delegate --mode final-review --background --json "审一下这个大型变更"
```

Manage:

- `crb status`: view job status
- `crb result <job-id>`: get the result
- `crb cancel <job-id>`: cancel the job

Foreground mode has a default timeout of 180000ms and is best for quick review. Background mode defaults to no timeout unless `--timeout-ms` is explicitly passed. For `final-review` or any large G2/G3 review, prefer `--background`.

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

`--json` results may come back with model logs or markdown fences around the JSON. The bridge extracts the structured review JSON when possible and stores raw output in background job records for debugging.

By default the bridge starts `reasonix run --no-config` under a temporary HOME and only carries necessary API key / base URL env through. This keeps user MCP, nowledge-mem, and global Reasonix tools out of the reviewer runtime. Use `--no-isolate-runtime` only when explicitly debugging the full Reasonix environment.

## Discipline

Reasonix output is review input, not an unconditional patch.

Codex must:

1. Summarize which mode was called.
2. State the main review findings.
3. Say what was applied or intentionally ignored.
4. Verify any code/UI changes itself.

If Reasonix cannot be called, state the exact command attempted and the error, then continue with Codex's own judgment instead of pretending Reasonix was consulted.
