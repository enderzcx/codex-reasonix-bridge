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

## Modes

- `engineering-feedback`: DeepSeek v4 Pro second opinion on Codex's engineering plan or diff
- `engineering-plan`: DeepSeek v4 Pro review of Codex's implementation plan and verification strategy
- `daily-review`: DeepSeek v4 Pro daily second opinion
- `final-review`: high-confidence final judgment
- `general`: mixed Reasonix review fallback

## Discipline

Reasonix output is review input, not an unconditional patch.

Codex must:

1. Summarize which mode was called.
2. State the main review findings.
3. Say what was applied or intentionally ignored.
4. Verify any code/UI changes itself.

If Reasonix cannot be called, state the exact command attempted and the error, then continue with Codex's own judgment instead of pretending Reasonix was consulted.
