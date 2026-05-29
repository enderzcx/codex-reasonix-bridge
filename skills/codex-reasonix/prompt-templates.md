# Prompt Templates

Consult:

```text
商量一下这个问题，给取舍、推荐路径和 Codex 下一步。不要默认进入 review schema；输入不够就标 [NEEDS_INPUT]。
```

Final review:

```text
审 blocker/high risk/missing tests；如果输入不够，标 [NEEDS_INPUT] 并列出缺的文件或 diff。
```

Adversarial review:

```text
主动找反例、错误假设、隐藏风险、回滚缺口和未验证边界。不要为了平衡而淡化 blocker。
```

Engineering plan review:

```text
审实现计划的边界、验证命令、回滚点、遗漏步骤。不要写 patch；Codex 会执行。
```

Always include enough context for Reasonix to review from the attached prompt alone.
