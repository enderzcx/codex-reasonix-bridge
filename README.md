# codex-reasonix-bridge

Codex-first bridge for Chinese developer workflows.

Codex stays the engineering executor. Reasonix/Ollama Cloud models help with copy,
UI taste, page structure, human feedback messages, naming, and second opinions.

This repo is intentionally external to Reasonix core. Reasonix can remain
DeepSeek-first, cache-first, and single-model-loop oriented, while this bridge
adds multi-model collaboration around Codex.

## Why

Codex is strong at implementation, tests, refactors, and final code judgment.
For Chinese product copy, public-facing UI text, human-sounding feedback, and
visual/page narrative, it helps to call models that are better at language and
taste.

This bridge gives Codex a small, explicit protocol:

1. Codex decides the task mode.
2. The bridge routes to a role model.
3. Reasonix runs the model.
4. The bridge returns copy, brief, plan, or review output.
5. Codex decides what to apply and verifies the code.

## Install

```bash
git clone https://github.com/<you>/codex-reasonix-bridge.git
cd codex-reasonix-bridge
npm test
npm link
```

The bridge expects `reasonix` to be available on `PATH`.
If it is not, it falls back to:

```text
/Applications/Reasonix.app/Contents/Resources/node
/Applications/Reasonix.app/Contents/Resources/dist/cli/index.js
```

You can override the binary:

```bash
REASONIX_BIN=/path/to/reasonix codex-reasonix-bridge delegate --mode copywrite "写一个空状态"
```

## Usage

Dry-run route metadata:

```bash
codex-reasonix-bridge delegate --mode human-feedback --dry-run --json \
  "给 Lucas 写一段自然反馈"
```

Copywriting:

```bash
codex-reasonix-bridge delegate --mode copywrite --json \
  --context "audience: AI Native builders" \
  "给首页 hero 写标题、副标题和 CTA"
```

UI review with attached file:

```bash
codex-reasonix-bridge delegate --mode ui-review-cn --json \
  --input ./app/page.tsx \
  "审核中文 UI 文案、信息层级和排版节奏"
```

Engineering second opinion:

```bash
git diff > /tmp/change.diff
codex-reasonix-bridge delegate --mode engineering-feedback --json \
  --input /tmp/change.diff \
  "从风险、边界、测试角度审这个改动"
```

Short alias:

```bash
crb delegate --mode naming "给这个 Codex + Reasonix 小工具取名"
```

## Modes

| Mode | Primary | Use for |
|---|---|---|
| `copywrite` | `qwen3.5:cloud` | Product copy, UI microcopy, CTA, empty/error/onboarding text |
| `human-feedback` | `kimi-k2.6:cloud` | Messages to coworkers, customers, Sonya/Lucas-style feedback |
| `layout-director` | `kimi-k2.6:cloud` | Page hierarchy, section order, visual rhythm |
| `frontend-ux-plan` | `deepseek-v4-pro:cloud` | Full UI/UX plan Codex will implement |
| `visual-brief` | `kimi-k2.6:cloud` | Briefs for image generation or UI reference images |
| `ui-review-cn` | `qwen3.5:cloud` | Chinese UI language, terms, hierarchy, layout rhythm |
| `rewrite-cn` | `qwen3.5:cloud` | Chinese rewriting without changing facts |
| `naming` | `qwen3.5:cloud` | Product, feature, page, action naming |
| `engineering-feedback` | `glm-5.1:cloud` | Engineering second opinion, bug risk, design feedback |
| `engineering-plan` | `glm-5.1:cloud` | Implementation plan and verification strategy |
| `daily-review` | `minimax-m2.7:cloud` | Low-cost daily review |
| `final-review` | `deepseek-v4-pro:cloud` | Final high-value judgment |
| `general` | `deepseek-v4-flash:cloud` | Mixed low-cost tasks |

## Contract

The bridge output is not an unconditional patch.

Reasonix may produce:

- copy
- briefs
- naming candidates
- review findings
- implementation plans
- visual constraints

Codex remains responsible for:

- code edits
- tests
- accessibility
- responsive behavior
- final engineering judgment
- deciding what to apply

## Codex skill

Install the bundled skill into `$CODEX_HOME/skills`:

```bash
npm run install:skill
```

Then future Codex sessions can follow `codex-reasonix` for UI/copy/human-feedback
tasks.

## Upstream boundary

Good upstream PRs for Reasonix core:

- OpenAI-compatible `/models` doctor fallback
- streaming `include_usage` support
- CLI bundle package metadata for correct `--version`
- DeepSeek/Ollama Cloud model id normalization when narrowly scoped
- desktop context token meter fixes

Keep in this bridge:

- Codex collaboration protocol
- multi-model role routing
- Qwen/Kimi/GLM/MiniMax task delegation
- Codex AGENTS/skill rules
- overlay/update-proof installer logic

See [docs/upstream-prs.md](docs/upstream-prs.md).
