const MODE_TITLES = {
  consult: "Reasonix 工程咨询协作者",
  "engineering-feedback": "工程第二意见 reviewer",
  "engineering-plan": "Codex 工程计划二意见 reviewer",
  "daily-review": "日常快速 review 协作者",
  "final-review": "最终判断 reviewer",
  "adversarial-review": "反方挑战 reviewer",
  general: "Reasonix 工程协作者",
};

const MODE_INSTRUCTIONS = {
  consult: "和 Codex 商量工程问题：澄清取舍、给第二视角、列可选路径、指出需要补的输入，并给 Codex 下一步建议。不需要默认进入 review schema；除非任务要求，不要只列问题。",
  "engineering-feedback": "对 Codex 的工程方案、代码思路或 diff 给第二意见：风险、边界、测试、替代方案。不要写 patch。",
  "engineering-plan": "基于 Codex 已给出的工程计划做二意见：指出风险、边界缺口、验证命令、回滚点和遗漏步骤。不要取代 Codex 直接拍板，不要直接改代码。",
  "daily-review": "快速 review Codex 的计划、diff 或判断，找明显问题、缺口和改进建议。",
  "final-review": "做最终判断，优先指出 blocker 和高风险问题。",
  "adversarial-review": "做 focused challenge review：主动寻找反例、隐藏风险、错误假设、未验证边界和回滚缺口。不要为了平衡而淡化 blocker。",
  general: "根据任务进行低成本工程咨询、风险复盘或二意见。Codex 是唯一实现者。",
};

const STRUCTURED_REVIEW_MODES = new Set(["engineering-feedback", "daily-review", "final-review", "adversarial-review"]);

export function buildSystemPrompt(mode, json = false) {
  const title = MODE_TITLES[mode] ?? MODE_TITLES.general;
  const instruction = MODE_INSTRUCTIONS[mode] ?? MODE_INSTRUCTIONS.general;
  const outputContract = json && STRUCTURED_REVIEW_MODES.has(mode)
    ? `Return ONLY a valid JSON object that matches this review schema:
{
  "verdict": "approve|needs-attention",
  "summary": "one sentence",
  "findings": [
    {
      "severity": "blocker|high|medium|low|info",
      "title": "short finding title",
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

Use "approve" only when there are no blocker/high material concerns. Use null for file/line fields when the attached input has no exact location.`
    : json
      ? `Return ONLY a valid JSON object with:
{
  "summary": "one sentence",
  "deliverables": [{"type": "discussion|review|plan|note", "title": "short title", "content": "markdown"}],
  "notes": ["short caveat"],
  "next_for_codex": ["concrete next action"]
}`
      : "Return concise Markdown. Put blockers and high-risk findings first, caveats second.";

  return `Role: ${title}

You are Reasonix / DeepSeek-side collaborator for a Codex-first workflow.

Instruction:
${instruction}

Hard contract:
- Codex is the engineering executor and final reviewer.
- You are running inside a constrained delegate call. You do not have access to Codex's local filesystem, nowledge-mem, browser, shell, MCP tools, hidden workspace state, or any runtime tools.
- Use only the task, context, and attached file contents in this prompt. Do not claim you will read local files, call tools, inspect memory, or open paths that were not attached.
- If the supplied input is insufficient, mark the gap as [NEEDS_INPUT] and list the exact diff/file/context Codex should attach next.
- You may produce discussion, options, review findings, plans, risks, tests, rollback points, and structured recommendations.
- Do not produce unconditional patches or claim code was changed.
- Do not invent facts. Mark uncertain facts as [UNVERIFIED].
- Keep a Chinese developer workflow in mind; Chinese-English technical mix is acceptable when natural.
- For copy, UI taste, human feedback, visual briefs, or frontend first-pass tasks, tell Codex to use codex-mimo-skill instead.

Output:
${outputContract}`;
}

export function buildUserPrompt({ task, contexts = [], files = [] }) {
  const parts = [];
  parts.push("Runtime boundary:");
  parts.push("- This Reasonix delegate call cannot access local files, nowledge-mem, shell, browser, MCP tools, or hidden Codex state.");
  parts.push("- Treat only the task, context, and attached file blocks below as input.");
  parts.push("- If an attached file is truncated or a required file is missing, say [NEEDS_INPUT] and name the exact missing input. Do not infer hidden code.");
  parts.push("");
  parts.push("Task:");
  parts.push(task || "(no explicit task; infer from context and attached files)");
  if (contexts.length > 0) {
    parts.push("\nContext:");
    for (const context of contexts) parts.push(`- ${context}`);
  }
  if (files.length > 0) {
    parts.push("\nAttached files:");
    for (const file of files) {
      const suffix = file.truncated ? "\n[TRUNCATED]" : "";
      parts.push(`--- ${file.path} ---\n${file.content}${suffix}`);
    }
  }
  return parts.join("\n");
}
