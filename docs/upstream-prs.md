---
half_life: 30d
archive_at: 2026-06-26
---

# Reasonix Upstream PR Split

This repo keeps Codex-specific DeepSeek review behavior out of Reasonix core.

Reasonix upstream signal: PR #1911 was closed even with green CI/CodeQL because
the maintainer wants core to stay DeepSeek-first, cache-first, and single-model
loop oriented. That is reasonable. The bridge/MCP/tooling layer belongs outside.

## Good Upstream PRs

### 1. Doctor `/models` Fallback

Status: local change exists in `DeepSeek-Reasonix`.

Why upstream:

- OpenAI-compatible endpoints often support `/models` but not `/user/balance`.
- This is not Codex-specific.
- It fixes false negative doctor output for Ollama Cloud style routing.

Suggested PR title:

```text
fix(cli): accept /models as API reachability check
```

### 2. Streaming Usage Metadata

Status: local change exists in `src/client.ts`.

Why upstream:

- `stream_options: { include_usage: true }` lets streaming calls report token
  usage when the provider supports it.
- Useful for all users, not only Codex bridge users.

Suggested PR title:

```text
fix(client): request usage metadata for streaming chat
```

### 3. CLI Bundle Version Metadata

Status: local change exists in `scripts/copy-dashboard-vendor-css.mjs`.

Why upstream:

- App-bundled CLI should not report `0.0.0-dev`.
- Adding `dist/cli/package.json` with name/version/type is generic packaging hygiene.

Suggested PR title:

```text
fix(cli): preserve package version in bundled CLI
```

### 4. Context Token Meter

Status: PR #1964 is open and CI/CodeQL are green.

Why upstream:

- Desktop context meter should show live log tokens while a turn is running.
- It is a UI correctness fix, not bridge policy.

Suggested action:

Wait for maintainer review or nudge with a short comment if it stalls.

### 5. Narrow DeepSeek/Ollama Model Alias Normalization

Status: local changes exist but are mixed with bridge model routing.

Why upstream:

- Mapping `deepseek-v4-pro` to `deepseek-v4-pro:cloud` can avoid UI 404s when
  an OpenAI-compatible/Ollama endpoint expects `:cloud`.

Risk:

- Do not upstream MiMo direct provider or copy/UI workflow into core.
- Keep the PR only about DeepSeek model id compatibility.

Suggested PR title:

```text
fix(config): normalize DeepSeek cloud model aliases
```

## Keep In This Repo

- `delegate` mode protocol
- Codex AGENTS/skill collaboration rules
- DeepSeek v4 Pro review routing
- overlay/update-proof installation
- any MCP/Codex bridge server

## Moved To `codex-mimo-skill`

- MiMo direct provider
- Chinese copy/UI/human-feedback workflow
- `frontend-first-pass`
- MiMo env loading and OpenAI-compatible direct calls

## Why

Reasonix core should be a focused DeepSeek client.

`codex-reasonix-bridge` should be the Reasonix review layer around Codex:

```text
Codex -> bridge mode/router -> Reasonix/DeepSeek -> review -> Codex applies
```
