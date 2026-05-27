# AGENTS.md

## Project

`codex-reasonix-bridge` is an external Codex-first bridge for Reasonix.

It exists because Reasonix upstream wants core to remain DeepSeek-first,
cache-first, and single-model-loop oriented. This bridge adds multi-model
collaboration outside core.

## Working Rules

- Keep the bridge external. Do not vendor or fork Reasonix core.
- Prefer stable `reasonix run` as the execution boundary.
- Reasonix-side models may produce copy, briefs, naming, reviews, and plans.
- Codex remains the only engineering executor and final code reviewer.
- Add modes only when they map to a real Codex workflow.
- Avoid product claims that imply official Reasonix ownership.

## Verification

Run:

```bash
npm test
npm run smoke
```

`npm run smoke` is a dry-run and should not call paid models.

For live model verification, use a short prompt:

```bash
codex-reasonix-bridge delegate --mode copywrite --json "Reply with one short Chinese empty state"
```

## Upstream Discipline

If a change is useful to Reasonix without Codex-specific routing, consider a
small upstream PR. If it adds Codex protocol, model role routing, or Chinese
developer workflow policy, keep it in this repo.
