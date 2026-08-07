# Runtime

Prefer Codex plugin MCP tools `reasonix_*` when installed. Fall back to `crb` for Reasonix / DeepSeek Flash formal engineering consultation and review.

Runtime boundary: `crb delegate`, `crb consult`, and `crb review` (and the MCP wrappers) call native `reasonix delegate`. Review/delegation must not depend on `reasonix run`.

Default model: **`deepseek-v4-flash:0731-cloud`** (Flash formal). Pro preview is optional via `--model deepseek-v4-pro`.

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

Credential check: this local bridge routes review/consult through Reasonix's `ollama-cloud` provider using `OLLAMA_API_KEY`. `reasonix doctor --json` only proves the configured key is present, not that it is valid. If live `crb consult` fails with `HTTP 401` or says the provider key is invalid or expired, update `~/.reasonix/.env` or run `reasonix setup`, then retry a one-line `crb consult` smoke test.
