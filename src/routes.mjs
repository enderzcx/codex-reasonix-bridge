export const DELEGATE_MODES = [
  "copywrite",
  "human-feedback",
  "layout-director",
  "frontend-ux-plan",
  "visual-brief",
  "ui-review-cn",
  "rewrite-cn",
  "naming",
  "engineering-feedback",
  "engineering-plan",
  "daily-review",
  "final-review",
  "general",
];

export const MODEL_CATALOG = [
  {
    id: "qwen3.5:cloud",
    aliases: ["qwen3.5", "qwen3.5:397b"],
    usageLevel: "medium",
    bestFor: ["中文文案", "命名", "UI microcopy", "视觉理解"],
    notes: "中文表达和创意补位强；只产出内容候选，代码交回 Codex。",
  },
  {
    id: "kimi-k2.6:cloud",
    aliases: ["kimi-k2.6", "kimi2.6", "k2.6"],
    usageLevel: "high",
    bestFor: ["真人反馈", "视觉 brief", "页面叙事", "设计转前端 brief"],
    notes: "适合更像真人的反馈和视觉叙事；不直接产出 patch。",
  },
  {
    id: "glm-5.1:cloud",
    aliases: ["glm-5.1", "glm5.1"],
    usageLevel: "high",
    bestFor: ["工程反馈", "工程 plan", "复杂 bug 第二视角", "长程 review"],
    notes: "质量强但可能慢；适合后台 plan/review。",
  },
  {
    id: "minimax-m2.7:cloud",
    aliases: ["minimax-m2.7", "m2.7"],
    usageLevel: "medium",
    bestFor: ["日常 review", "信息结构", "多轮修订", "低成本协作"],
    notes: "性价比 fallback；关键仲裁仍交给 Codex/DeepSeek/GLM。",
  },
  {
    id: "minimax-m2.5:cloud",
    aliases: ["minimax-m2.5", "m2.5"],
    usageLevel: "medium",
    bestFor: ["中文润色", "microcopy fallback", "低成本日常任务"],
    notes: "稳定低成本 fallback。",
  },
  {
    id: "deepseek-v4-flash:cloud",
    aliases: ["deepseek-v4-flash", "v4-flash"],
    usageLevel: "medium",
    bestFor: ["低成本 Reasonix 默认", "长上下文日常任务", "fallback"],
    notes: "日常低成本候选；复杂最终判断升级到 Pro。",
  },
  {
    id: "deepseek-v4-pro:cloud",
    aliases: ["deepseek-v4-pro", "v4-pro"],
    usageLevel: "extra-high",
    bestFor: ["完整 UI/UX 方案", "最终工程二意见", "复杂判断", "长上下文仲裁"],
    notes: "可靠兜底；成本高，不承担所有创意/日常任务。",
  },
  {
    id: "mimo-v2.5-pro",
    aliases: ["mimo2.5pro", "mimo-v2.5-pro:cloud"],
    usageLevel: "unknown",
    bestFor: ["未来候选", "自部署长上下文 agent"],
    notes: "当前 Ollama Cloud 不稳定/不可用时不参与默认路由。",
  },
];

export const MODE_ROUTES = {
  copywrite: {
    primaryModel: "qwen3.5:cloud",
    fallbackModels: ["kimi-k2.6:cloud", "minimax-m2.5:cloud", "minimax-m2.7:cloud", "deepseek-v4-flash:cloud"],
    outputKind: "copy",
    rationale: "Codex 的中文文案容易偏功能说明；Qwen 起稿，Kimi 补真人语感，MiniMax 低成本修订。",
  },
  "human-feedback": {
    primaryModel: "kimi-k2.6:cloud",
    fallbackModels: ["glm-5.1:cloud", "deepseek-v4-pro:cloud", "qwen3.5:cloud", "minimax-m2.5:cloud"],
    outputKind: "copy",
    rationale: "同事/客户反馈需要像真人，Kimi 优先；GLM/DeepSeek 做结构和判断兜底。",
  },
  "rewrite-cn": {
    primaryModel: "qwen3.5:cloud",
    fallbackModels: ["minimax-m2.5:cloud", "minimax-m2.7:cloud", "deepseek-v4-flash:cloud"],
    outputKind: "copy",
    rationale: "中文润色需要自然和术语稳定。",
  },
  naming: {
    primaryModel: "qwen3.5:cloud",
    fallbackModels: ["minimax-m2.7:cloud", "minimax-m2.5:cloud", "deepseek-v4-flash:cloud"],
    outputKind: "copy",
    rationale: "命名依赖中文/英文语感和产品语境，Codex 负责最终落到代码标识符。",
  },
  "layout-director": {
    primaryModel: "kimi-k2.6:cloud",
    fallbackModels: ["qwen3.5:cloud", "deepseek-v4-pro:cloud", "minimax-m2.7:cloud"],
    outputKind: "ia",
    rationale: "页面结构、信息层级、视觉节奏需要设计语感，Codex 负责实现。",
  },
  "frontend-ux-plan": {
    primaryModel: "deepseek-v4-pro:cloud",
    fallbackModels: ["glm-5.1:cloud", "kimi-k2.6:cloud", "qwen3.5:cloud", "deepseek-v4-flash:cloud"],
    outputKind: "ia",
    rationale: "完整 UI/UX 方案要兼顾产品、实现、响应式和可访问性，DeepSeek Pro 先做全局 plan。",
  },
  "visual-brief": {
    primaryModel: "kimi-k2.6:cloud",
    fallbackModels: ["qwen3.5:cloud", "minimax-m2.7:cloud", "deepseek-v4-pro:cloud"],
    outputKind: "tokens",
    rationale: "视觉参考图或 UI brief 需要外部审美补位；输出设计约束，不写代码。",
  },
  "ui-review-cn": {
    primaryModel: "qwen3.5:cloud",
    fallbackModels: ["kimi-k2.6:cloud", "minimax-m2.7:cloud", "deepseek-v4-pro:cloud"],
    outputKind: "review",
    rationale: "中文 UI review 要先看语气、术语、信息层级，再由 Codex 改代码。",
  },
  "engineering-feedback": {
    primaryModel: "glm-5.1:cloud",
    fallbackModels: ["deepseek-v4-pro:cloud", "kimi-k2.6:cloud", "minimax-m2.7:cloud"],
    outputKind: "review",
    rationale: "工程二意见需要强推理和长程上下文，GLM 优先，DeepSeek Pro 仲裁。",
  },
  "engineering-plan": {
    primaryModel: "glm-5.1:cloud",
    fallbackModels: ["deepseek-v4-pro:cloud", "minimax-m2.7:cloud", "deepseek-v4-flash:cloud"],
    outputKind: "plan",
    rationale: "工程 plan 需要执行边界、风险和验证路径，不产出 patch。",
  },
  "daily-review": {
    primaryModel: "minimax-m2.7:cloud",
    fallbackModels: ["deepseek-v4-flash:cloud", "glm-5.1:cloud", "qwen3.5:cloud"],
    outputKind: "review",
    rationale: "日常反馈要快、稳、便宜，关键问题再升级。",
  },
  "final-review": {
    primaryModel: "deepseek-v4-pro:cloud",
    fallbackModels: ["glm-5.1:cloud", "kimi-k2.6:cloud", "minimax-m2.7:cloud"],
    outputKind: "review",
    rationale: "最终判断成本高但要稳，Codex 仍保留最终工程裁决权。",
  },
  general: {
    primaryModel: "deepseek-v4-flash:cloud",
    fallbackModels: ["qwen3.5:cloud", "minimax-m2.7:cloud", "deepseek-v4-pro:cloud"],
    outputKind: "brief",
    rationale: "混合任务默认低成本，必要时显式指定 mode 或 model。",
  },
};

const aliasMap = new Map();
for (const model of MODEL_CATALOG) {
  aliasMap.set(model.id, model.id);
  for (const alias of model.aliases) aliasMap.set(alias, model.id);
}

const modeAliases = new Map([
  ["copywriting", "copywrite"],
  ["copy-draft", "copywrite"],
  ["feedback", "human-feedback"],
  ["human", "human-feedback"],
  ["layout", "layout-director"],
  ["uiux", "frontend-ux-plan"],
  ["ux", "frontend-ux-plan"],
  ["visual", "visual-brief"],
  ["ui-review", "ui-review-cn"],
  ["ui_review", "ui-review-cn"],
  ["rewrite", "rewrite-cn"],
  ["eng-feedback", "engineering-feedback"],
  ["eng-plan", "engineering-plan"],
  ["plan", "engineering-plan"],
  ["code-review", "final-review"],
  ["review", "final-review"],
]);

export function normalizeModelId(model) {
  const trimmed = String(model ?? "").trim();
  return aliasMap.get(trimmed) ?? trimmed;
}

export function normalizeMode(mode) {
  const raw = String(mode || "general").trim();
  const normalized = modeAliases.get(raw) ?? raw;
  if (!DELEGATE_MODES.includes(normalized)) {
    throw new Error(`unsupported delegate mode: ${mode}`);
  }
  return normalized;
}

export function resolveRoute({ mode = "general", model, availableModels = [] } = {}) {
  const normalizedMode = normalizeMode(mode);
  const route = MODE_ROUTES[normalizedMode];
  const normalizedAvailable = availableModels.map(normalizeModelId).filter(Boolean);
  const candidates = [route.primaryModel, ...route.fallbackModels].map(normalizeModelId);
  let selected = normalizeModelId(model);
  let selection = "explicit";

  if (!selected) {
    const available = new Set(normalizedAvailable);
    if (available.size === 0 || available.has(route.primaryModel)) {
      selected = route.primaryModel;
      selection = "primary";
    } else {
      selected = candidates.find((candidate) => available.has(candidate)) ?? normalizedAvailable[0] ?? route.primaryModel;
      selection = candidates.includes(selected) ? "fallback" : "available";
    }
  }

  return {
    mode: normalizedMode,
    model: selected,
    primaryModel: route.primaryModel,
    fallbackModels: route.fallbackModels,
    availableModels: normalizedAvailable,
    selection,
    outputKind: route.outputKind,
    allowCode: false,
    handoffTo: "codex",
    rationale: route.rationale,
  };
}

export function routeMetadata(route) {
  return {
    mode: route.mode,
    selected_model: route.model,
    primary_model: route.primaryModel,
    fallback_models: route.fallbackModels,
    available_models: route.availableModels,
    selection: route.selection,
    output_kind: route.outputKind,
    allow_code: false,
    handoff_to: "codex",
    rationale: route.rationale,
  };
}
