# Runtime

Use `crb` only for Reasonix / DeepSeek engineering review.

Preferred commands:

```bash
crb delegate --mode <mode> --json "<task>"
crb review --background --json "<focus>"
```

Long review should run in the background:

```bash
crb delegate --mode final-review --background --json "<task>"
crb status <job-id>
crb result <job-id>
crb cancel <job-id>
```

Attach actual evidence with `--input` or use `crb review` for current git context. Reasonix cannot read Codex local files, nowledge-mem, browser state, shell output, or hidden runtime state.
