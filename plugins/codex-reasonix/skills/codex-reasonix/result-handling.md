# Result Handling

Treat `crb result <job-id>` as source-of-truth output.

- `crb result <job-id>` returns rendered Markdown for humans.
- `crb result --json <job-id>` returns the full job record with `result`, `rendered`, `raw`, logs, and errors.
- Preserve blocker/high findings, `[NEEDS_INPUT]`, file/line references, and validation gaps.
- If `parse_status` is `raw-fallback` or `schema-fallback`, relay the useful raw output and say parsing or schema validation failed.
- Never claim Reasonix was consulted unless a command actually ran.

For failed calls, report the exact command attempted and the error.
