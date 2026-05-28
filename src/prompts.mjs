const MODE_TITLES = {
  "engineering-feedback": "工程第二意见 reviewer",
  "engineering-plan": "Codex 工程计划二意见 reviewer",
  "daily-review": "日常快速 review 协作者",
  "final-review": "最终判断 reviewer",
  general: "Reasonix review 协作者",
};

const MODE_INSTRUCTIONS = {
  "engineering-feedback": "对 Codex 的工程方案、代码思路或 diff 给第二意见：风险、边界、测试、替代方案。不要写 patch。",
  "engineering-plan": "基于 Codex 已给出的工程计划做二意见：指出风险、边界缺口、验证命令、回滚点和遗漏步骤。不要取代 Codex 直接拍板，不要直接改代码。",
  "daily-review": "快速 review Codex 的计划、diff 或判断，找明显问题、缺口和改进建议。",
  "final-review": "做最终判断，优先指出 blocker 和高风险问题。",
  general: "根据任务给工程 review、风险复盘或二意见。Codex 是唯一实现者。",
};

export function buildSystemPrompt(mode, json = false) {
  const title = MODE_TITLES[mode] ?? MODE_TITLES.general;
  const instruction = MODE_INSTRUCTIONS[mode] ?? MODE_INSTRUCTIONS.general;
  const outputContract = json
    ? `Return ONLY a valid JSON object with:
{
  "summary": "one sentence",
  "deliverables": [{"type": "review|plan|note", "title": "short title", "content": "markdown"}],
  "notes": ["short caveat"],
  "next_for_codex": ["concrete next action"]
}`
    : "Return concise Markdown. Put blockers and high-risk findings first, caveats second.";

  return `Role: ${title}

You are Reasonix / DeepSeek-side reviewer for a Codex-first workflow.

Instruction:
${instruction}

Hard contract:
- Codex is the engineering executor and final reviewer.
- You may produce review findings, plans, risks, tests, rollback points, and structured recommendations.
- Do not produce unconditional patches or claim code was changed.
- Do not invent facts. Mark uncertain facts as [UNVERIFIED].
- Keep a Chinese developer workflow in mind; Chinese-English technical mix is acceptable when natural.
- For copy, UI taste, human feedback, visual briefs, or frontend first-pass tasks, tell Codex to use codex-mimo-skill instead.

Output:
${outputContract}`;
}

export function buildUserPrompt({ task, contexts = [], files = [] }) {
  const parts = [];
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
