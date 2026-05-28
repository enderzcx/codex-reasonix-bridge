export const DELEGATE_MODES = [
  "engineering-feedback",
  "engineering-plan",
  "daily-review",
  "final-review",
  "general",
];

export const MODEL_CATALOG = [
  {
    id: "deepseek-v4-pro:cloud",
    provider: "reasonix",
    aliases: ["deepseek-v4-pro", "v4-pro"],
    usageLevel: "extra-high",
    bestFor: ["工程 review", "最终 review", "复杂判断", "长上下文仲裁"],
    notes: "Review lane 固定主力；通过 Reasonix / Ollama Cloud 运行。",
  },
  {
    id: "deepseek-v4-flash:cloud",
    provider: "reasonix",
    aliases: ["deepseek-v4-flash", "v4-flash"],
    usageLevel: "medium",
    bestFor: ["低成本 Reasonix 默认", "长上下文日常任务", "fallback"],
    notes: "日常低成本候选；复杂最终判断升级到 Pro。",
  },
  {
    id: "glm-5.1:cloud",
    provider: "reasonix",
    aliases: ["glm-5.1", "glm5.1"],
    usageLevel: "high",
    bestFor: ["工程 plan fallback", "复杂 bug 第二视角 fallback", "长程 review fallback"],
    notes: "DeepSeek Pro 不可用时作为 Reasonix review fallback。",
  },
  {
    id: "minimax-m2.7:cloud",
    provider: "reasonix",
    aliases: ["minimax-m2.7", "m2.7"],
    usageLevel: "medium",
    bestFor: ["低成本 fallback", "信息结构 fallback", "多轮修订 fallback"],
    notes: "成本敏感时的 fallback；默认 review 已固定到 DeepSeek Pro。",
  },
];

export const MODE_ROUTES = {
  "engineering-feedback": {
    primaryModel: "deepseek-v4-pro:cloud",
    fallbackModels: ["glm-5.1:cloud", "minimax-m2.7:cloud", "deepseek-v4-flash:cloud"],
    outputKind: "review",
    rationale: "Codex 先做工程判断；此 mode 只把 Codex 的方案或 diff 交给 DeepSeek v4 Pro 做二意见。",
  },
  "engineering-plan": {
    primaryModel: "deepseek-v4-pro:cloud",
    fallbackModels: ["glm-5.1:cloud", "minimax-m2.7:cloud", "deepseek-v4-flash:cloud"],
    outputKind: "plan",
    rationale: "Codex owns engineering plan；此 mode 只用于让 DeepSeek v4 Pro review/补强 Codex 的计划。",
  },
  "daily-review": {
    primaryModel: "deepseek-v4-pro:cloud",
    fallbackModels: ["glm-5.1:cloud", "minimax-m2.7:cloud", "deepseek-v4-flash:cloud"],
    outputKind: "review",
    rationale: "日常 review 固定 DeepSeek v4 Pro；Codex 负责采纳与实现。",
  },
  "final-review": {
    primaryModel: "deepseek-v4-pro:cloud",
    fallbackModels: ["glm-5.1:cloud", "minimax-m2.7:cloud", "deepseek-v4-flash:cloud"],
    outputKind: "review",
    rationale: "Final review 固定 DeepSeek v4 Pro；Codex 仍保留最终工程裁决权。",
  },
  general: {
    primaryModel: "deepseek-v4-flash:cloud",
    fallbackModels: ["deepseek-v4-pro:cloud", "minimax-m2.7:cloud"],
    outputKind: "review",
    rationale: "混合 review 默认低成本；重要判断显式使用 final-review。",
  },
};

const aliasMap = new Map();
const modelMap = new Map();
for (const model of MODEL_CATALOG) {
  aliasMap.set(model.id, model.id);
  modelMap.set(model.id, model);
  for (const alias of model.aliases) aliasMap.set(alias, model.id);
}

const modeAliases = new Map([
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
    provider: providerForModel(selected),
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
    provider: route.provider,
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

export function providerForModel(model) {
  return modelMap.get(normalizeModelId(model))?.provider ?? "reasonix";
}
