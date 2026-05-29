# codex-reasonix-bridge 中文说明

本仓库的主 README 已使用中文编写，包含了所有详细说明。

**请直接访问主文档：[README.md](README.md)**

主文档内容包括：

- **项目定位**：对标 [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) 的体验模型；plugin-cc 是 Claude Code 调 Codex，本仓库是 Codex 调 Reasonix / DeepSeek v4 Pro
- **前置依赖**：必须先安装并配置 Reasonix CLI 或 Reasonix 桌面版；`crb` 不是 DeepSeek provider，而是 Codex 调用 Reasonix / DeepSeek v4 Pro 的 bridge
- **30 秒快速开始**：安装、dry-run 测试、首次调用
- **模式 (Modes) 速查**：五种 review 模式的区别和用法
- **结构化 review schema**：`final-review` / `engineering-feedback` / `daily-review` / `adversarial-review` 的 `verdict`、`findings`、`next_steps`
- **结果处理契约**：后台 job 保存 `result`、`rendered`、`raw`；`crb result` 默认返回 rendered 输出
- **职责边界**：本仓库与 [`codex-mimo-skill`](https://github.com/enderzcx/codex-mimo-skill) 的明确分工
- **常用命令**：针对 diff review、计划审查等场景的示例
- **架构原则**：为何保持外部 bridge，以及 upstream PR 方向
- **plugin-cc 对标**：完整参照 [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) 的 command / runtime / job / schema / hook 分层，详见 [docs/codex-plugin-cc-reference.md](docs/codex-plugin-cc-reference.md)
