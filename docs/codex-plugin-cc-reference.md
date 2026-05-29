---
half_life: 30d
archive_at: 2026-06-28
---

# openai/codex-plugin-cc Architecture Reference

Source: https://github.com/openai/codex-plugin-cc

Local reference commit: `807e03ac9d5aa23bc395fdec8c3767500a86b3cf`

This document records how `openai/codex-plugin-cc` is structured, and how `codex-reasonix-bridge` / `codex-mimo-skill` should borrow the useful parts without copying the wrong responsibility model.

## Conclusion

`codex-plugin-cc` is not just a CLI wrapper. It is a full delegation boundary:

1. Claude Code commands are thin forwarders.
2. A deterministic companion script owns all runtime behavior.
3. Codex app-server owns the actual model turn, tools, threads, progress, and structured output.
4. Background jobs are first-class, inspectable, cancellable artifacts.
5. Review output has a schema, a renderer, and a raw-output fallback.
6. Hooks are optional and narrow, not the default way every task runs.

For our stack, the correct adaptation is:

- `crb` should mirror the review/job/result contract most closely.
- `cmi` should mirror the background job/result contract, but not the Codex review contract.
- Neither tool should become a general builder that replaces Codex. Codex remains the context owner and final implementer.

## Layer Map

### 1. Plugin Package Layer

Files:

- `plugins/codex/.claude-plugin/plugin.json`
- `plugins/codex/commands/*.md`
- `plugins/codex/agents/codex-rescue.md`
- `plugins/codex/skills/*/SKILL.md`
- `plugins/codex/hooks/hooks.json`

Role:

- Makes Claude Code discover slash commands, subagents, hooks, and skills.
- Keeps the LLM-facing command prompts small and strict.
- Gives each command a deterministic shell entrypoint instead of asking the host model to improvise.

Our equivalent:

- Codex skills: `codex-reasonix`, `codex-mimo`
- CLIs: `crb`, `cmi`
- AGENTS.md rules

Gap:

- We do not have a real plugin package with command frontmatter like `disable-model-invocation`.
- Codex skills are guidance, not a hard command contract, so other sessions can still paraphrase, skip, or misuse results.

### 2. Command Policy Layer

Example files:

- `commands/review.md`
- `commands/adversarial-review.md`
- `commands/rescue.md`
- `commands/status.md`
- `commands/result.md`
- `commands/cancel.md`

Important patterns:

- Commands are explicit about allowed tools.
- Review commands say review only, do not fix.
- Result commands say return stdout verbatim, do not summarize.
- Background commands do not poll in the same turn.
- If the task is large, commands recommend background mode.

Our adaptation:

- `crb result <job-id>` and `cmi result <job-id>` should be treated as source-of-truth output.
- Skills should say: relay raw findings before summarizing, and never pretend a model was called.
- For long review or long UI/copy generation, use `--background`.

Gap:

- We need stronger result-handling docs for both `crb` and `cmi`.
- We should add tests that assert README/SKILL examples keep the thin-forwarder contract.

### 3. Companion Runtime Layer

Main file:

- `scripts/codex-companion.mjs`

Responsibilities:

- Parse command arguments.
- Resolve workspace.
- Collect review context.
- Start foreground or background job.
- Call Codex app-server.
- Persist result payload.
- Render final output.
- Route `status`, `result`, `cancel`, and setup commands.

Our equivalent:

- `src/cli.mjs` in `codex-reasonix-bridge`
- `src/cli.mjs` in `codex-mimo-skill`

What we already copied well:

- Foreground and background modes.
- `status`, `result`, `cancel`.
- Review-context collection for `crb review`.
- Isolation around Reasonix runtime.

Gap:

- The companion in `codex-plugin-cc` has a clearer separation between raw payload and rendered text.
- Our job records should keep both machine payload and human-rendered result.

### 4. Runtime Adapter Layer

Files:

- `scripts/lib/app-server.mjs`
- `scripts/lib/codex.mjs`
- `scripts/app-server-broker.mjs`

Role:

- Talks to the Codex app-server instead of invoking a loose shell model.
- Captures thread IDs, turn IDs, progress events, tool calls, file changes, commands, and reasoning summaries.
- Uses `outputSchema` for adversarial review, so structured output is enforced by the model runtime.

Our equivalent:

- `src/reasonix.mjs` for `crb`
- MiMo API client in `codex-mimo-skill`

Important difference:

- Reasonix/MiMo do not give us Codex app-server guarantees.
- We cannot assume schema-perfect final messages.
- We must extract fenced/mixed JSON, validate it, and keep raw output when parsing fails.

What we should not copy:

- Codex app-server thread semantics. Reasonix/MiMo are stateless collaborators for our use case.

### 5. Git Review Context Layer

File:

- `scripts/lib/git.mjs`

Patterns:

- Detects whether review target is working tree, staged changes, or branch diff.
- Collects status, diffs, commit log, diff stat, and untracked files.
- Caps inline diff size.
- Gives Codex enough metadata to inspect further because Codex has read-only filesystem tools.

Our adaptation:

- `crb review` now collects explicit git context and sends it to Reasonix.
- Reasonix must not try to read local files, MCP state, or hidden workspace paths.

Important difference:

- Codex can inspect the repo during review.
- DeepSeek through Reasonix cannot, unless we attach the data.

Rule for `crb`:

- If the attached context is insufficient, output `[NEEDS_INPUT]` with the missing file/diff names.
- Do not hallucinate from paths.

### 6. Job State Layer

Files:

- `scripts/lib/tracked-jobs.mjs`
- `scripts/lib/state.mjs`
- `scripts/lib/job-control.mjs`

Patterns:

- Jobs are per-workspace.
- Each job records status, kind, phase, PID, start/end time, thread ID, turn ID, payload, rendered output, and log.
- `status` shows indexed jobs.
- `result` fetches one job.
- `cancel` terminates a running job.
- Old job artifacts are pruned when the index grows too large.

Our adaptation:

- `crb` and `cmi` already have background jobs.

Gap:

- Add pruning.
- Store a stable `rendered` field.
- Expose parse errors and raw model output in a consistent way.

### 7. Structured Review Layer

Files:

- `prompts/adversarial-review.md`
- `schemas/review-output.schema.json`
- `scripts/lib/render.mjs`

Review schema shape:

- `verdict`: `approve` or `needs-attention`
- `summary`
- `findings[]`
- `next_steps[]`

Finding shape:

- `severity`
- `title`
- `body`
- `file`
- `line_start`
- `line_end`
- `confidence`
- `recommendation`

Patterns:

- Schema controls the final Codex output.
- Renderer validates the shape again before presenting it.
- If parsing fails, the raw final message is shown so the operator can still use the review.

Our adaptation:

- `crb --json` already extracts JSON from mixed/fenced output.

Gap:

- Add a formal `review-output.schema.json`.
- Make review modes render consistent finding tables.
- Keep raw output visible when schema validation fails.

### 8. Hook / Gate Layer

Files:

- `hooks/hooks.json`
- `scripts/session-lifecycle-hook.mjs`
- `scripts/stop-review-gate-hook.mjs`
- `prompts/stop-review-gate.md`

Pattern:

- Review gate is optional setup, not default behavior.
- The gate reviews the previous Claude turn and can block if Codex finds issues.
- Docs warn it can create long loops or usage spikes.

Our adaptation:

- Keep hooks optional.
- Do not make MiMo or DeepSeek auto-run for every task.
- Only use automatic gates for high-value review paths.

Gap:

- We can integrate `crb final-review` with an explicit review artifact gate later.
- Do not add a global MiMo hook. Copy/design review should be triggered by task type, not every turn.

### 9. Skill Layer

Files:

- `skills/codex-cli-runtime/SKILL.md`
- `skills/codex-result-handling/SKILL.md`
- `skills/gpt-5-4-prompting/SKILL.md`

Patterns:

- Runtime skill tells the agent how to call the CLI.
- Result-handling skill tells the agent not to summarize away important output.
- Prompting skill is only used to sharpen delegation prompts.

Our adaptation:

- `codex-reasonix` and `codex-mimo` should be split the same way if misuse keeps happening:
  - runtime call rules
  - result handling rules
  - prompt template rules

Gap:

- Today each skill mixes all three concerns.
- That is readable, but weaker as a hard operating contract.

### 10. Test Contract Layer

Files:

- `tests/commands.test.mjs`
- `tests/state.test.mjs`
- `tests/git.test.mjs`
- `tests/render.test.mjs`
- `tests/process.test.mjs`
- `tests/broker-endpoint.test.mjs`

What tests enforce:

- Commands are thin wrappers.
- Background commands do not accidentally wait.
- Result commands do not summarize.
- State files behave.
- Review rendering is deterministic.
- Process cancellation works.

Our adaptation:

- Keep unit tests around route/model selection, env loading, job state, git context, and JSON extraction.

Gap:

- Add doc-contract tests for README/SKILL examples.
- Add render tests after introducing `rendered`.

## What This Means For crb

`crb` should be closest to `codex-plugin-cc` because both are review tools.

Keep:

- `delegate`
- `review`
- `status`
- `result`
- `cancel`
- `--background`
- `--json`
- isolated runtime
- explicit git context

Add next:

1. Formal review schema and validator.
2. Stable human renderer.
3. Raw-output fallback on parse failure.
4. Job pruning.
5. Doc-contract tests for command examples and result handling.
6. Optional `adversarial-review` alias/mode for focused challenge review.

Do not add:

- A builder/rescue role. Codex owns build and rescue in our workflow.
- Broad automatic hooks by default.
- Hidden filesystem access assumptions.

## What This Means For cmi

`cmi` should copy the job/result discipline, not the review identity.

Keep:

- `delegate`
- `status`
- `result`
- `cancel`
- `--background`
- `.env` fallback for MiMo key
- mode-specific prompts

Add next:

1. Stable rendered result per mode.
2. Raw-output fallback.
3. Optional JSON schemas for `frontend-ux-plan`, `ui-review-cn`, and `human-feedback`.
4. Job pruning.
5. Result-handling skill text that says MiMo output is a brief or candidate, not an automatic patch.

Do not add:

- Deep engineering review contract.
- Automatic global hook.
- Production code shipping without Codex integration and browser validation.

## Recommended Roadmap

### Phase 1: Make Results Trustworthy

Scope:

- `crb`
- `cmi`
- G2 review / UI / copy delegation

Work:

- Add `rendered` to job payloads.
- Show raw model output when parsing fails.
- Add state pruning.
- Add tests for `result` and parse-failure display.

Disable when:

- One-off local experiments where no background job is used.

### Phase 2: Make Review Structured

Scope:

- `crb final-review`
- `crb engineering-feedback`
- G2/G3 review tasks

Work:

- Add `schemas/review-output.schema.json`.
- Validate review output after extraction.
- Render findings with severity, file, line, confidence, recommendation.
- Add `adversarial-review` mode for focused challenge prompts.

Disable when:

- The user only asks for a loose brainstorming second opinion.
- Input does not include enough source context to attach file/line findings.

### Phase 3: Make Skills Harder To Misuse

Scope:

- Installed Codex skills
- AGENTS.md collaboration rules

Work:

- Split runtime, result-handling, and prompt-template docs if sessions keep misusing the tools.
- Add command examples that prefer background for long tasks.
- State explicitly that Codex must report the command attempted when delegation fails.

Disable when:

- A repo has its own stricter AGENTS.md or project-specific workflow.

### Phase 4: Optional Plugin Packaging

Scope:

- If these tools need to work across machines or with fewer AGENTS.md assumptions.

Work:

- Package `crb` / `cmi` as discoverable commands with command frontmatter.
- Add deterministic command wrappers.
- Consider setup/health commands.

Disable when:

- The current Codex skill + local CLI setup is enough.
- We are still changing model routes frequently.

## Practical Rule

Use `codex-plugin-cc` as a contract reference, not as a role reference.

- It delegates from Claude to Codex because Codex is the stronger coding agent.
- We delegate from Codex to MiMo or DeepSeek for narrower roles.
- Therefore we copy its command/job/schema discipline, but keep Codex as the main product and engineering owner.
