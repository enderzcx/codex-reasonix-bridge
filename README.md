# codex-reasonix-bridge

> Codex 写代码，Reasonix / DeepSeek v4 Pro 做 review。

`codex-reasonix-bridge` 是一个外部 Codex bridge，用来把 Codex 的工程计划、diff、bug 假设和最终判断交给 Reasonix / DeepSeek v4 Pro 过一遍。

```text
Codex plans/builds -> bridge calls Reasonix / DeepSeek -> review -> Codex decides and verifies
```

## 和 codex-mimo-skill 的分工

MiMo 已经从这个仓库拆出去，单独放在 [`codex-mimo-skill`](https://github.com/enderzcx/codex-mimo-skill)。

| 仓库 | 模型 / harness | 负责什么 |
|---|---|---|
| `codex-mimo-skill` | Codex 直接调用 MiMo | 文案、中文表达、UI/UX、human feedback、frontend first-pass |
| `codex-reasonix-bridge` | Reasonix / DeepSeek v4 Pro | 工程 review、二意见、最终判断 |

这个仓库不再提供 MiMo provider，也不处理 UI 文案和前端首版。那些任务走 `codex-mimo`。

## 30 秒上手

```bash
npm link
```

先跑 dry-run，确认路由不花钱：

```bash
crb delegate --mode final-review --dry-run --json "审一下这个方案"
# 预期：返回 deepseek-v4-pro:cloud 的路由信息，不调用模型
```

真实 review 需要本机已有可用 `reasonix`：

```bash
crb delegate --mode final-review --json "审一下这个方案有没有明显风险"
```

如果 `reasonix` 不在 `PATH`，可以指定二进制：

```bash
REASONIX_BIN=/path/to/reasonix crb delegate --mode final-review --json "审一下这个方案"
```

## Modes

| Mode | 默认模型 | 用途 |
|---|---|---|
| `engineering-feedback` | `deepseek-v4-pro:cloud` | 对 Codex 的方案或 diff 做工程二意见 |
| `engineering-plan` | `deepseek-v4-pro:cloud` | 对 Codex 的实现计划、验证策略、回滚点做 review |
| `daily-review` | `deepseek-v4-pro:cloud` | 日常 second opinion |
| `final-review` | `deepseek-v4-pro:cloud` | 高价值最终判断 |
| `general` | `deepseek-v4-flash:cloud` | 低成本混合 review |

## 常用命令

工程第二意见：

```bash
git diff > /tmp/change.diff
crb delegate --mode engineering-feedback --json \
  --input /tmp/change.diff \
  "从风险、边界、测试角度审这个改动"
```

计划 review：

```bash
crb delegate --mode engineering-plan --json \
  --context "gravity: G2" \
  "审一下这个实现计划的边界、验证和回滚点"
```

最终判断：

```bash
crb delegate --mode final-review --json \
  --input /tmp/change.diff \
  "只列 blocker/high risk 和必须补的验证"
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
REASONIX_BIN=/path/to/reasonix crb delegate --mode final-review --json "审一下这个方案"
```

## Codex Skill

安装内置 skill：

```bash
npm run install:skill
```

安装后，未来 Codex session 可以按 `codex-reasonix` 的规则，在工程二意见、计划 review、日常 review、最终判断等任务里自动调用 bridge。

## 为什么仍然是外部 bridge

Reasonix core 应保持 DeepSeek-first、cache-first、single-model loop。这个仓库只做 Codex 侧的 review 协作边界，不要求 Reasonix core 为 Codex workflow 背复杂多模型策略。

适合继续给 Reasonix upstream PR 的：

- OpenAI-compatible `/models` doctor fallback
- streaming `include_usage` support
- CLI bundle package metadata for correct `--version`
- narrowly scoped DeepSeek/Ollama Cloud model id normalization
- desktop context token meter fixes

应该留在外部仓库的：

- Codex review protocol
- DeepSeek v4 Pro role routing
- Codex AGENTS / skill collaboration rules

具体拆分见 [docs/upstream-prs.md](docs/upstream-prs.md)。

## License

MIT
