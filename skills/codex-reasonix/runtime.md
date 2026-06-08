# Runtime

Use `crb` for Reasonix / DeepSeek engineering consultation and review.

Runtime boundary: `crb delegate`, `crb consult`, and `crb review` call native `reasonix delegate`. Review/delegation must not depend on `reasonix run`.

Runtime source of truth:

- Official Reasonix current line is Go `main-v2`; implement/debug native delegate there.
- The old TypeScript `main` / `v1` runtime is legacy and should not be the target for new bridge work.
- `reasonix delegate` is a one-shot provider call, not the full tool-using agent loop.

Preferred commands:

```bash
crb consult --json "<question>"
crb delegate --mode <mode> --json "<task>"
crb review --background --json "<focus>"
crb review --compact --background --json "<focus for large diffs>"
```

Long consult/review should run in the background:

```bash
crb consult --background --json "<question>"
crb delegate --mode final-review --background --json "<task>"
crb status <job-id>
crb result <job-id>
crb cancel <job-id>
```

Attach actual evidence with `--input` or use `crb review` for current git context. `crb review` auto-compacts oversized context; add `--compact` when you already know the diff is large or the review should focus on blocker/high issues only. Reasonix cannot read Codex local files, nowledge-mem, browser state, shell output, or hidden runtime state.
