# Runtime

Use `crb` for Reasonix / DeepSeek engineering consultation and review.

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
