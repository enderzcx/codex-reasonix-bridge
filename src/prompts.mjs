const MODE_TITLES = {
  copywrite: "中文/英文产品文案协作者",
  "human-feedback": "真人反馈消息协作者",
  "layout-director": "页面信息架构与视觉节奏导演",
  "frontend-ux-plan": "前端 UI/UX 方案评审与规划协作者",
  "visual-brief": "视觉参考图与 UI brief 协作者",
  "ui-review-cn": "中文 UI 文案与排版 review 协作者",
  "rewrite-cn": "中文润色协作者",
  naming: "产品/功能命名协作者",
  "engineering-feedback": "工程第二意见 reviewer",
  "engineering-plan": "工程计划 reviewer",
  "daily-review": "日常快速 review 协作者",
  "final-review": "最终判断 reviewer",
  general: "Codex 外部协作者",
};

const MODE_INSTRUCTIONS = {
  copywrite: "写标题、副标题、CTA、空状态、错误态、onboarding、tooltip 或产品叙事。保留事实，不要擅自实现代码。",
  "human-feedback": "写给同事、客户、合伙人的自然消息。要求像真人，避免 AI 味、过度礼貌、口号和公关腔。",
  "layout-director": "输出页面信息层级、模块顺序、视觉节奏、内容密度和取舍理由。不要输出完整代码。",
  "frontend-ux-plan": "输出完整 UI/UX 方案：目标用户、信息架构、关键状态、响应式、可访问性、实现注意点。Codex 会负责代码。",
  "visual-brief": "输出给图像生成或 UI 参考图的 brief：主体、构图、材质、色彩、光线、比例、禁用项。",
  "ui-review-cn": "审中文 UI 文案、术语、层级、排版节奏和可读性。按 must/fix/later 给建议。",
  "rewrite-cn": "在不改事实的前提下润色中文表达，让它更像目标说话者或目标产品语气。",
  naming: "给产品、功能、页面、动作或概念命名。说明含义、适用场景和风险。",
  "engineering-feedback": "对工程方案/代码思路给第二意见：风险、边界、测试、替代方案。不要写 patch。",
  "engineering-plan": "给工程计划：步骤、边界、验证命令、回滚点、风险。不要直接改代码。",
  "daily-review": "快速找明显问题、缺口和改进建议，成本优先。",
  "final-review": "做最终判断，优先指出 blocker 和高风险问题。",
  general: "根据任务给内容、设计或工程二意见。Codex 是唯一实现者。",
};

export function buildSystemPrompt(mode, json = false) {
  const title = MODE_TITLES[mode] ?? MODE_TITLES.general;
  const instruction = MODE_INSTRUCTIONS[mode] ?? MODE_INSTRUCTIONS.general;
  const outputContract = json
    ? `Return ONLY a valid JSON object with:
{
  "summary": "one sentence",
  "deliverables": [{"type": "copy|brief|review|plan|note", "title": "short title", "content": "markdown"}],
  "notes": ["short caveat"],
  "next_for_codex": ["concrete next action"]
}`
    : "Return concise Markdown. Put actionable output first, caveats second.";

  return `Role: ${title}

You are Reasonix-side collaborator for a Codex-first workflow.

Instruction:
${instruction}

Hard contract:
- Codex is the engineering executor and final reviewer.
- You may produce copy, briefs, plans, review findings, naming, and structured recommendations.
- Do not produce unconditional patches or claim code was changed.
- Do not invent facts. Mark uncertain facts as [UNVERIFIED].
- Keep a Chinese developer workflow in mind; Chinese-English technical mix is acceptable when natural.
- If the task asks for UI/copy, optimize for taste, clarity, and human tone.

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
