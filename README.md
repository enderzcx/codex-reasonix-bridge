# codex-reasonix-bridge

> **Codex 写代码，中文模型写文案。**
>
> 一个外部桥接器：让 Codex 继续负责工程实现、测试和最终判断，让 Reasonix / Ollama Cloud 模型负责中文产品文案、UI 语感、页面结构、命名和第二意见。

`codex-reasonix-bridge` 不改 Reasonix core，也不抢 Codex 的执行权。它只做一件事：在 Codex 开始写代码或定稿前，把适合交给中文模型的部分先问一遍。

```text
Codex decides -> bridge routes -> Reasonix runs model -> copy/brief/review -> Codex applies
```

## 30 秒上手

```bash
npm link
```

先跑 dry-run，确认路由不花钱：

```bash
crb delegate --mode copywrite --dry-run --json "写一句空状态"
# 预期：返回 qwen3.5:cloud 的路由信息，不调用模型
```

再跑一条真实任务，需要本机已有可用 `reasonix`：

```bash
crb delegate --mode naming --json "给这个桥接器取三个候选名"
# 预期：返回 JSON，包含命名建议和 Codex 下一步动作
```

如果 `reasonix` 不在 `PATH`，可以指定二进制：

```bash
REASONIX_BIN=/path/to/reasonix crb delegate --mode copywrite --json "写一个空状态"
```

## 适用场景

| 场景 | 推荐 Mode | 推荐模型 |
|---|---|---|
| 中文 UI 文案生硬，CTA、空状态、错误态像机器写的 | `copywrite`, `rewrite-cn`, `naming` | Qwen / MiniMax |
| 页面信息层级、模块顺序、视觉节奏拿不准 | `layout-director`, `visual-brief`, `ui-review-cn` | Kimi / Qwen |
| 给 Sonya、Lucas、客户或同事写反馈，要像真人 | `human-feedback` | Kimi |
| 想在 Codex 实现前找第二意见 | `engineering-feedback`, `engineering-plan`, `final-review` | GLM / DeepSeek Pro |

## 核心契约

Bridge 只产出建议，不直接改代码：

- copy
- brief
- naming candidates
- review findings
- implementation plans
- visual constraints

Codex 必须自己负责：

- code edits
- tests
- accessibility
- responsive behavior
- final engineering judgment
- 决定采纳、改写或丢弃 Reasonix 的建议

## 模式速查

这些 mode 不是让模型替 Codex 写代码，而是把“文案、结构、反馈、评审”这些更适合先讨论的部分拆出来。

### 文案与表达

| Mode | 默认模型 | 用途 |
|---|---|---|
| `copywrite` | `qwen3.5:cloud` | 产品文案、UI 微文案、CTA、空态、错误态、onboarding |
| `rewrite-cn` | `qwen3.5:cloud` | 中文润色，不改事实 |
| `naming` | `qwen3.5:cloud` | 产品、功能、页面、动作、概念命名 |
| `human-feedback` | `kimi-k2.6:cloud` | 写给同事、客户、用户的自然反馈 |

### 视觉与结构

| Mode | 默认模型 | 用途 |
|---|---|---|
| `layout-director` | `kimi-k2.6:cloud` | 页面信息层级、模块顺序、视觉节奏 |
| `visual-brief` | `kimi-k2.6:cloud` | 给图片生成或 UI 参考图写 brief |
| `ui-review-cn` | `qwen3.5:cloud` | 审中文 UI 用语、术语、层级、排版 |
| `frontend-ux-plan` | `deepseek-v4-pro:cloud` | 完整前端 UI/UX 方案，Codex 负责实现 |

### 工程与评审

| Mode | 默认模型 | 用途 |
|---|---|---|
| `engineering-feedback` | `glm-5.1:cloud` | 从风险、边界、测试角度审方案或 diff |
| `engineering-plan` | `glm-5.1:cloud` | 实现计划、验证策略、回滚点 |
| `daily-review` | `minimax-m2.7:cloud` | 低成本日常 review |
| `final-review` | `deepseek-v4-pro:cloud` | 高价值最终判断 |

### 通用任务

| Mode | 默认模型 | 用途 |
|---|---|---|
| `general` | `deepseek-v4-flash:cloud` | 低成本杂项任务 |

## 常用命令

产品文案：

```bash
crb delegate --mode copywrite --json \
  --context "audience: AI Native builders" \
  "给首页 hero 写标题、副标题和 CTA"
```

中文 UI review：

```bash
crb delegate --mode ui-review-cn --json \
  --input ./app/page.tsx \
  "审核中文 UI 文案、信息层级和排版节奏"
```

工程第二意见：

```bash
git diff > /tmp/change.diff
crb delegate --mode engineering-feedback --json \
  --input /tmp/change.diff \
  "从风险、边界、测试角度审这个改动"
```

给同事写自然反馈：

```bash
crb delegate --mode human-feedback --json \
  --context "tone: 像真人，不要 AI 味，不要公关腔" \
  "给 Lucas 写一段项目反馈"
```

## 安装与配置

```bash
git clone https://github.com/enderzcx/codex-reasonix-bridge.git
cd codex-reasonix-bridge
npm test
npm link
```

Bridge 默认寻找 `PATH` 上的 `reasonix`。如果没有，它会尝试使用桌面版内置 CLI：

```text
/Applications/Reasonix.app/Contents/Resources/node
/Applications/Reasonix.app/Contents/Resources/dist/cli/index.js
```

也可以通过 `REASONIX_BIN` 指定：

```bash
REASONIX_BIN=/path/to/reasonix crb delegate --mode copywrite --json "写一个空状态"
```

## Codex Skill

安装内置 skill：

```bash
npm run install:skill
```

安装后，未来 Codex session 可以按 `codex-reasonix` 的规则，在 UI、文案、中文表达、命名、视觉 brief、human feedback、工程二意见等任务里自动调用 bridge。

## 为什么不放进 Reasonix Core

Reasonix 上游已经表达过边界：core 应该保持 **DeepSeek-first、cache-first、single-model loop**。

这个仓库是外部协作层，专门处理 Codex 多模型路由、中文工作流和 skill 规则。

适合继续给 Reasonix upstream PR 的：

- OpenAI-compatible `/models` doctor fallback
- streaming `include_usage` support
- CLI bundle package metadata for correct `--version`
- narrowly scoped DeepSeek/Ollama Cloud model id normalization
- desktop context token meter fixes

应该留在 bridge 的：

- Codex collaboration protocol
- multi-model role routing
- Qwen / Kimi / GLM / MiniMax task delegation
- Codex AGENTS / skill collaboration rules
- overlay / update-proof installation logic

具体拆分见 [docs/upstream-prs.md](docs/upstream-prs.md)。

## License

MIT
