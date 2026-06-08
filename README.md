# codex-reasonix-bridge

> Use Reasonix / DeepSeek v4 Pro from inside Codex for engineering review, second opinions, and focused delegation.

`codex-reasonix-bridge` 是给 **已经在用 Codex、但想把 Reasonix / DeepSeek v4 Pro 接进 Codex 工作流** 的开发者用的 bridge。

它对标 [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) 的体验模型：plugin-cc 让 Claude Code 可以调用 Codex；本仓库让 Codex 可以调用 Reasonix / DeepSeek v4 Pro。工程 review 是当前最重要、最稳定的第一场景，但这个仓库的定位不是“只做 review”，而是 **Codex -> Reasonix** 的协作边界层。

```text
Codex plans/builds -> crb calls Reasonix -> DeepSeek v4 Pro responds -> Codex decides and verifies
```

## What You Get

- `crb consult` / `crb ask`：从 Codex 会话里和 Reasonix / DeepSeek v4 Pro 单纯商量工程问题
- `crb delegate`：从 Codex 会话里把工程问题交给 Reasonix / DeepSeek v4 Pro
- `crb review`：像 plugin-cc 一样自动收集当前 git review context，再交给 DeepSeek 审查
- `crb status` / `crb result` / `crb cancel`：管理后台任务，避免长 review 阻塞 Codex 主流程
- `rendered` / `raw` / `result`：同时保留人类可读输出、原始模型输出和结构化 payload
- JSON / fenced JSON / mixed output extraction：避免模型真实返回了内容，却被 bridge 误判成 “non-JSON”
- Native delegate runtime：bridge 通过 `reasonix delegate` 调用 Reasonix；review/delegation 不再依赖 `reasonix run`
- Input isolation：Reasonix reviewer 只看你显式传入的 task、context、diff 和文件，不偷偷读 Codex 本地 workspace

## Requirements: 先安装 Reasonix

`crb` 本身不是 DeepSeek provider，也不替代 Reasonix。DeepSeek v4 Pro 的执行 harness、模型路由、缓存和凭据管理都由 [DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix) 提供；`crb` 只负责把它接进 Codex 的工作流。

简单说：

```text
Reasonix runs DeepSeek -> crb makes it usable from Codex -> Codex applies the result
```

所以使用本仓库前，请先确保你已经安装并配置好 Reasonix CLI，或已经安装 Reasonix 桌面版（`crb` 会尝试自动使用桌面版内置 CLI）。如果两者都没有，`crb` 会报：

```text
Reasonix CLI not found. Install Reasonix.app or set REASONIX_BIN.
```

建议先验证 Reasonix 能单独工作：

```bash
reasonix --help
reasonix delegate --mode final-review --dry-run --json "reply reasonix-ok"
```

如果 `reasonix` 不在 PATH 中，但你知道 CLI 路径，可以用 `REASONIX_BIN` 指定：

```bash
REASONIX_BIN=/path/to/reasonix crb delegate --mode final-review --json "审一下这个方案"
```

本仓库的 job / review / result 协议主要参照 [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc)。完整拆解和后续对齐路线见 [docs/codex-plugin-cc-reference.md](docs/codex-plugin-cc-reference.md)。

当前结果契约已经按 plugin-cc 思路加固：后台 job 同时保存 `result`（结构化 payload）、`rendered`（人类可读输出）和 `raw`（原始模型输出）。`crb result <job-id>` 默认返回 `rendered`，`crb result --json <job-id>` 返回完整 job 记录。

## 与 codex-mimo-skill 的分工

MiMo 的相关能力（文案、中文表达、UI/UX 设计、前端反馈等）已独立拆分至 [`codex-mimo-skill`](https://github.com/enderzcx/codex-mimo-skill)。本仓库专注于 Codex 调用 Reasonix / DeepSeek v4 Pro 做工程协作。

| 仓库 | 模型 / Harness | 职责范围 |
|---|---|---|
| `codex-mimo-skill` | Codex 直接调用 MiMo | 文案、中文表达、UI/UX 设计、human feedback、前端代码首版 |
| `codex-reasonix-bridge` | Codex 调 Reasonix / DeepSeek v4 Pro | 工程 review、独立第二意见、focused delegation、最终技术判断 |

**本仓库不再包含 MiMo provider，也不处理 UI 文案和前端代码生成。这些任务请使用 `codex-mimo-skill`。**

## 30 秒快速开始

先安装并配置 Reasonix。确认 `reasonix delegate --mode final-review --dry-run --json ...` 能正常返回后，再安装 bridge：

```bash
git clone https://github.com/enderzcx/codex-reasonix-bridge.git
cd codex-reasonix-bridge
npm test
npm link
```

先执行一次 dry-run，验证路由配置且不产生实际调用费用：

```bash
crb delegate --mode final-review --dry-run --json "审一下这个方案"
# 预期：返回 deepseek-v4-pro:cloud 的路由信息，不调用模型
```

进行真实 review：

```bash
crb delegate --mode final-review --json "审一下这个方案有没有明显风险"
```

单纯商量问题，不进入 review schema：

```bash
crb consult --json "这个 auth 方案应该走 session 还是 JWT？请给取舍和下一步建议"
crb ask --json "这个 API 错误处理怎么收敛更合理？"
```

如果 `reasonix` 不在系统 PATH 中，可以通过环境变量指定其路径：

```bash
REASONIX_BIN=/path/to/reasonix crb delegate --mode final-review --json "审一下这个方案"
```

## 可用模式 (Modes)

每个模式对应一个特定协作场景。`consult` 和关键 review 默认使用 `deepseek-v4-pro:cloud`；低成本通用任务使用 `deepseek-v4-flash:cloud`。

| 模式 | 默认模型 | 典型用途 |
|---|---|---|
| `consult` | `deepseek-v4-pro:cloud` | 纯商量、第二意见、focused delegation，不强制 review schema |
| `engineering-feedback` | `deepseek-v4-pro:cloud` | 对 Codex 提交的方案或代码 diff 进行工程层面的反馈 |
| `engineering-plan` | `deepseek-v4-pro:cloud` | 审查 Codex 的实现计划、验证策略和回滚方案 |
| `daily-review` | `deepseek-v4-pro:cloud` | 日常开发中的快速 second opinion |
| `final-review` | `deepseek-v4-pro:cloud` | 高价值变更前的最终、权威判断 |
| `adversarial-review` | `deepseek-v4-pro:cloud` | 反方挑战审查，专找错误假设、隐藏风险、反例和回滚缺口 |
| `general` | `deepseek-v4-flash:cloud` | 低成本、通用的混合咨询 fallback |

## 常用命令示例

**单纯商量工程问题：**

```bash
crb consult --json \
  --context "gravity: G2; Codex will implement" \
  "这个后台 job runtime 应该保留 foreground fallback 吗？列取舍和建议"
```

**获取工程第二意见：**

```bash
git diff > /tmp/change.diff
crb delegate --mode engineering-feedback --json \
  --input /tmp/change.diff \
  "从风险、边界、测试角度审这个改动"
```

**审查实现计划：**

```bash
crb delegate --mode engineering-plan --json \
  --context "gravity: G2" \
  "审一下这个实现计划的边界、验证和回滚点"
```

**请求最终判断：**

```bash
crb delegate --mode final-review --json \
  --input /tmp/change.diff \
  "只列 blocker/high risk 和必须补的验证"
```

**请求反方挑战：**

```bash
crb delegate --mode adversarial-review --json \
  --input /tmp/change.diff \
  "主动找反例、错误假设、隐藏风险和没验证的边界"
```

**像 codex-plugin-cc 一样自动收集 git review context：**

```bash
crb review --background --json "重点看 schema/migration/rollback 风险"
crb status <job-id>
crb result <job-id>
```

`crb review` 会自动判断当前工作树或 branch diff，并把 git status、diff、untracked text files 作为显式输入传给 Reasonix。这样 reviewer 不需要、也不能自己去读本地路径。

大型 diff 可以直接走 compact review：

```bash
crb review --compact --background --json "只看 blocker/high 和必须补的验证"
```

默认 `crb review` 会先尝试完整 git context；如果超过输入 byte cap，会自动切换到 compact context。Compact context 包含 status、changed files、name-status、diff stat 和 `--unified=0` 的紧凑 hunks，并明确要求 Reasonix 在信息不足时返回 `[NEEDS_INPUT]`。

## 长时间任务使用后台 Job

当 consult/review 任务耗时较长，例如商量复杂架构方案、审查大型 diff 或跑最终判断时，建议使用后台 job 模式，避免 Codex 会话同步阻塞。后台 job 会在独立进程中运行，你可以通过命令管理其状态和结果。

**启动后台 consult：**

```bash
crb consult --background --json "商量一下这个多 agent 协作协议怎么收敛"
```

**启动后台 review：**

```bash
crb delegate --mode final-review --background --json "审一下这个大型架构重构方案"
```

**管理后台 job：**

- `crb status`：查看所有后台 job 的状态
- `crb result <job-id>`：获取指定 job 的 rendered review 结果
- `crb result --json <job-id>`：获取完整 job 记录，包括 `result`、`rendered`、`raw` 和错误信息
- `crb cancel <job-id>`：取消正在运行的后台 job

**前台模式（默认）：**

- 默认超时时间为 180000 毫秒（3 分钟）
- 可通过 `--timeout-ms` 参数自定义
- 适合快速、同步的 review 任务

**后台模式：**

- 默认 `timeoutMs` 为 0（无超时限制），除非显式传递 `--timeout-ms`
- 适合长时间、异步的深度 review
- 不阻塞 Codex 主工作流

**最佳实践：**
对于 `final-review` 等高价值模式，如果预计 review 时间较长，请优先使用 `--background`。前台模式适用于快速反馈场景，但长时间同步等待可能影响 Codex 的构建效率。

## JSON 输出与输入边界

Bridge 的 `--json` 会要求 Reasonix / DeepSeek 返回结构化 JSON。实际模型有时会在 JSON 外夹带日志、自然语言或 fenced code block；bridge 会尽量从 mixed output 中抽取符合当前 mode contract 的 JSON，并把原始输出保存在后台 job 记录里，方便排查。

`final-review`、`engineering-feedback`、`daily-review` 和 `adversarial-review` 使用正式 review schema，定义在 [schemas/review-output.schema.json](schemas/review-output.schema.json)：

```json
{
  "verdict": "approve|needs-attention",
  "summary": "one sentence",
  "findings": [
    {
      "severity": "blocker|high|medium|low|info",
      "title": "short title",
      "body": "specific evidence and impact",
      "file": "path or null",
      "line_start": 123,
      "line_end": 123,
      "confidence": "high|medium|low",
      "recommendation": "concrete fix or next check"
    }
  ],
  "next_steps": ["concrete next action"]
}
```

如果模型返回 fenced/mixed JSON，bridge 会抽取并校验；如果校验失败或不是 JSON，`parse_status` 会变成 `schema-fallback` 或 `raw-fallback`，`rendered` 会显示原始输出，避免其他 Codex session 把一次真实 review 误判成“模型没返回”。

**重要边界：Reasonix reviewer 不能读取 Codex 本地 workspace。**

它只能看到命令里传入的 task、`--context` 和 `--input` 文件内容。做代码 / schema / 架构 review 时，请显式附上 diff、schema、计划或关键文件：

```bash
git diff > /tmp/change.diff
crb delegate --mode final-review --background --json \
  --input /tmp/change.diff \
  "只审 blocker/high risk/missing tests；如果输入不够，标 [NEEDS_INPUT]"
```

如果是 review 当前 repo 改动，优先使用 `crb review --background --json`，让 bridge 脚本像 `openai/codex-plugin-cc` 一样先收集 git review target 再调用模型。

如果 reviewer 说 `[NEEDS_INPUT]`，说明应该补传具体文件或更小的 targeted diff，而不是让模型去读本地路径、nowledge-mem 或隐藏 runtime。

默认情况下，bridge 会用隔离的临时 HOME 启动 `reasonix delegate`，并从 Reasonix 本地配置中只提取必要 API key / base URL 到环境变量。`reasonix delegate` 本身是稳定的 Codex handoff runtime，不会进入 `reasonix run` 的 agent loop，也不会让 reviewer 读取 Codex workspace、nowledge-mem 或隐藏 runtime。确实需要完整 Reasonix HOME / 环境时才使用 `--no-isolate-runtime`。

## 安装与配置

本仓库只安装 `crb` 命令，不会替你安装 Reasonix，也不会直接配置 DeepSeek API key。Reasonix 的安装、模型配置和账号凭据请在 Reasonix 侧完成。

```bash
git clone https://github.com/enderzcx/codex-reasonix-bridge.git
cd codex-reasonix-bridge
npm test
npm link
```

Bridge 默认在系统 PATH 中寻找 `reasonix` 可执行文件。如果未找到，它会尝试使用 Reasonix 桌面版内置的 CLI：

```text
/Applications/Reasonix.app/Contents/Resources/node
/Applications/Reasonix.app/Contents/Resources/dist/cli/index.js
```

你也可以通过 `REASONIX_BIN` 环境变量精确指定：

```bash
REASONIX_BIN=/path/to/reasonix crb delegate --mode final-review --json "审一下这个方案"
```

## 安装 Codex Skill

安装内置 skill 后，Codex 在后续会话中可以根据 `codex-reasonix` 规则，自动在工程审查相关任务中调用此 bridge。

```bash
npm run install:skill
```

## 为什么保持为外部 Bridge

Reasonix 核心应保持 **DeepSeek 优先、缓存优先、单一模型循环** 的设计原则。本仓库仅作为 Codex 侧的 review 协作边界层，不要求 Reasonix 核心为 Codex 的复杂工作流引入多模型策略。

**适合提交给 Reasonix upstream 的 PR 方向：**

- OpenAI-compatible `/models` 端点的故障回退逻辑
- 流式响应中 `include_usage` 的支持
- CLI 打包元数据以正确输出 `--version`
- 针对 DeepSeek/Ollama Cloud 的 model ID 规范化（需严格限定范围）
- 桌面端上下文 token 计量修复

**应保留在本外部仓库的：**

- Codex review 协议定义
- DeepSeek v4 Pro 的角色路由逻辑
- Codex AGENTS / skill 协作规则

具体的拆分原则详见 [docs/upstream-prs.md](docs/upstream-prs.md)。

## 许可证

MIT
