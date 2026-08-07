export const DELEGATE_MODES = [
  "consult",
  "engineering-feedback",
  "engineering-plan",
  "daily-review",
  "final-review",
  "adversarial-review",
  "general",
];

// Formal DeepSeek V4 Flash (Ollama cloud tag 0731). Preferred over Pro preview for review.
const FLASH_0731 = "ollama-cloud/deepseek-v4-flash:0731-cloud";
// Pro remains available as optional/preview fallback, not the default review primary.
const PRO = "ollama-cloud/deepseek-v4-pro";

export const MODEL_CATALOG = [
  {
    id: FLASH_0731,
    provider: "reasonix",
    aliases: [
      "deepseek-v4-flash:0731-cloud",
      "deepseek-v4-flash:0731",
      "v4-flash-0731",
      "deepseek-v4-flash",
      "deepseek-v4-flash:cloud",
      "v4-flash",
      "ollama-cloud/deepseek-v4-flash",
      "ollama/deepseek-v4-flash:0731-cloud",
    ],
    usageLevel: "extra-high",
    bestFor: ["工程 review", "最终 review", "对抗 review", "二意见", "长上下文判断"],
    notes:
      "DeepSeek V4 Flash 正式版（Ollama tag deepseek-v4-flash:0731-cloud）。当前 review/consult 主模型；能力与稳定性优先于 Pro preview。",
  },
  {
    id: PRO,
    provider: "reasonix",
    aliases: ["deepseek-v4-pro", "deepseek-v4-pro:cloud", "v4-pro"],
    usageLevel: "high",
    bestFor: ["Pro preview 对照", "显式 -m 指定", "flash 不可用时 fallback"],
    notes: "DeepSeek V4 Pro preview。默认不再作为 review 主力；需要对照时显式 --model deepseek-v4-pro。",
  },
  {
    id: "ollama-cloud/glm-5.1",
    provider: "reasonix",
    aliases: ["glm-5.1", "glm-5.1:cloud", "glm5.1"],
    usageLevel: "high",
    bestFor: ["工程 plan fallback", "复杂 bug 第二视角 fallback", "长程 review fallback"],
    notes: "Flash 不可用时的 Reasonix review fallback。",
  },
  {
    id: "ollama-cloud/minimax-m2.7",
    provider: "reasonix",
    aliases: ["minimax-m2.7", "minimax-m2.7:cloud", "m2.7"],
    usageLevel: "medium",
    bestFor: ["低成本 fallback", "信息结构 fallback", "多轮修订 fallback"],
    notes: "成本敏感时的 fallback。",
  },
];

export const MODE_ROUTES = {
  consult: {
    primaryModel: FLASH_0731,
    fallbackModels: [PRO, "ollama-cloud/glm-5.1", "ollama-cloud/minimax-m2.7"],
    outputKind: "discussion",
    rationale: "Codex <-> Reasonix consultation 默认 Flash 正式版（0731）；Pro preview 仅作 fallback 或显式对照。",
  },
  "engineering-feedback": {
    primaryModel: FLASH_0731,
    fallbackModels: [PRO, "ollama-cloud/glm-5.1", "ollama-cloud/minimax-m2.7"],
    outputKind: "review",
    rationale: "工程二意见默认 Flash 正式版；Codex 仍拥有最终裁决与落地。",
  },
  "engineering-plan": {
    primaryModel: FLASH_0731,
    fallbackModels: [PRO, "ollama-cloud/glm-5.1", "ollama-cloud/minimax-m2.7"],
    outputKind: "plan",
    rationale: "计划 review 默认 Flash 正式版。",
  },
  "daily-review": {
    primaryModel: FLASH_0731,
    fallbackModels: [PRO, "ollama-cloud/glm-5.1", "ollama-cloud/minimax-m2.7"],
    outputKind: "review",
    rationale: "日常 review 默认 Flash 正式版（0731）。",
  },
  "final-review": {
    primaryModel: FLASH_0731,
    fallbackModels: [PRO, "ollama-cloud/glm-5.1", "ollama-cloud/minimax-m2.7"],
    outputKind: "review",
    rationale: "Final review 默认 Flash 正式版；需要 Pro preview 对照时显式 --model deepseek-v4-pro。",
  },
  "adversarial-review": {
    primaryModel: FLASH_0731,
    fallbackModels: [PRO, "ollama-cloud/glm-5.1"],
    outputKind: "review",
    rationale: "对抗 review 默认 Flash 正式版，主动找反例与隐藏风险。",
  },
  general: {
    primaryModel: FLASH_0731,
    fallbackModels: [PRO, "ollama-cloud/minimax-m2.7"],
    outputKind: "discussion",
    rationale: "通用咨询默认 Flash 正式版。",
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
  ["ask", "consult"],
  ["chat", "consult"],
  ["discuss", "consult"],
  ["discussion", "consult"],
  ["rescue", "consult"],
  ["second-opinion", "consult"],
  ["eng-feedback", "engineering-feedback"],
  ["eng-plan", "engineering-plan"],
  ["plan", "engineering-plan"],
  ["code-review", "final-review"],
  ["review", "final-review"],
  ["adversarial", "adversarial-review"],
  ["challenge-review", "adversarial-review"],
  ["challenge", "adversarial-review"],
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
