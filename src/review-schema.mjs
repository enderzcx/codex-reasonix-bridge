const REVIEW_VERDICTS = new Set(["approve", "needs-attention"]);
const FINDING_SEVERITIES = new Set(["blocker", "high", "medium", "low", "info"]);
const CONFIDENCE_LEVELS = new Set(["high", "medium", "low"]);

export const STRUCTURED_REVIEW_MODES = new Set([
  "engineering-feedback",
  "daily-review",
  "final-review",
  "adversarial-review",
]);

export function isStructuredReviewMode(mode) {
  return STRUCTURED_REVIEW_MODES.has(mode);
}

export function normalizeReviewOutput(value) {
  const direct = validateReviewOutput(value);
  if (direct.ok) return { ...direct, normalized: false };

  const alternate = normalizeAlternateReviewShape(value);
  if (!alternate) return { ...direct, normalized: false };

  const normalized = validateReviewOutput(alternate);
  if (!normalized.ok) {
    return {
      ok: false,
      normalized: false,
      errors: [
        ...direct.errors,
        "legacy review normalization failed",
        ...normalized.errors,
      ],
    };
  }

  return { ...normalized, normalized: true };
}

export function validateReviewOutput(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["review output must be a JSON object"] };
  }

  if (!REVIEW_VERDICTS.has(value.verdict)) {
    errors.push("verdict must be approve or needs-attention");
  }
  if (typeof value.summary !== "string" || value.summary.trim() === "") {
    errors.push("summary must be a non-empty string");
  }
  if (!Array.isArray(value.findings)) {
    errors.push("findings must be an array");
  }
  if (!Array.isArray(value.next_steps)) {
    errors.push("next_steps must be an array");
  }

  const findings = Array.isArray(value.findings) ? value.findings : [];
  findings.forEach((finding, index) => {
    const prefix = `findings[${index}]`;
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    if (!FINDING_SEVERITIES.has(finding.severity)) {
      errors.push(`${prefix}.severity must be blocker, high, medium, low, or info`);
    }
    for (const key of ["title", "body", "recommendation"]) {
      if (typeof finding[key] !== "string" || finding[key].trim() === "") {
        errors.push(`${prefix}.${key} must be a non-empty string`);
      }
    }
    if (finding.file !== undefined && finding.file !== null && typeof finding.file !== "string") {
      errors.push(`${prefix}.file must be a string or null`);
    }
    for (const key of ["line_start", "line_end"]) {
      if (
        finding[key] !== undefined &&
        finding[key] !== null &&
        (!Number.isInteger(finding[key]) || finding[key] < 1)
      ) {
        errors.push(`${prefix}.${key} must be a positive integer or null`);
      }
    }
    if (!CONFIDENCE_LEVELS.has(finding.confidence)) {
      errors.push(`${prefix}.confidence must be high, medium, or low`);
    }
  });

  const nextSteps = Array.isArray(value.next_steps) ? value.next_steps : [];
  nextSteps.forEach((step, index) => {
    if (typeof step !== "string" || step.trim() === "") {
      errors.push(`next_steps[${index}] must be a non-empty string`);
    }
  });

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      verdict: value.verdict,
      summary: value.summary.trim(),
      findings: findings.map((finding) => ({
        severity: finding.severity,
        title: finding.title.trim(),
        body: finding.body.trim(),
        file: finding.file ?? null,
        line_start: finding.line_start ?? null,
        line_end: finding.line_end ?? null,
        confidence: finding.confidence,
        recommendation: finding.recommendation.trim(),
      })),
      next_steps: nextSteps.map((step) => step.trim()),
    },
  };
}

function normalizeAlternateReviewShape(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const hasLegacyReviewShape = Array.isArray(value.deliverables) || Array.isArray(value.next_for_codex);
  if (!hasLegacyReviewShape) return null;

  const findings = Array.isArray(value.deliverables)
    ? value.deliverables
        .map((item, index) => normalizeDeliverableFinding(item, index))
        .filter(Boolean)
    : [];
  if (Array.isArray(value.deliverables) && value.deliverables.length > 0 && findings.length === 0) {
    return null;
  }
  const nextSteps = normalizeStringArray(
    Array.isArray(value.next_steps) ? value.next_steps : value.next_for_codex,
  );
  const summary = firstNonEmptyString([
    value.summary,
    findings.length ? "Reasonix returned review items in a legacy payload shape." : null,
    "Reasonix returned a legacy review payload.",
  ]);

  return {
    verdict: REVIEW_VERDICTS.has(value.verdict) ? value.verdict : inferVerdict(findings),
    summary,
    findings,
    next_steps: nextSteps,
  };
}

function normalizeDeliverableFinding(item, index) {
  if (typeof item === "string") {
    const body = item.trim();
    if (!body) return null;
    return buildFinding({
      title: firstLine(body) || `Review item ${index + 1}`,
      body,
    });
  }

  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const title = firstNonEmptyString([item.title, item.type, `Review item ${index + 1}`]);
  const body = firstNonEmptyString([item.content, item.body, item.summary, title]);
  if (!body) return null;

  return buildFinding({
    title,
    body,
    severity: item.severity,
    confidence: item.confidence,
    recommendation: item.recommendation,
    file: item.file ?? item.path ?? null,
    line_start: item.line_start ?? item.line ?? null,
    line_end: item.line_end ?? item.line ?? null,
  });
}

function buildFinding({
  title,
  body,
  severity,
  confidence,
  recommendation,
  file,
  line_start,
  line_end,
}) {
  return {
    severity: normalizeSeverity(severity) ?? inferSeverity({ title, body, recommendation }),
    title: title.trim(),
    body: body.trim(),
    file: typeof file === "string" && file.trim() ? file.trim() : null,
    line_start: normalizeLine(line_start),
    line_end: normalizeLine(line_end),
    confidence: normalizeConfidence(confidence) ?? "medium",
    recommendation: firstNonEmptyString([
      recommendation,
      "Review this normalized legacy item and decide whether action is needed.",
    ]),
  };
}

function normalizeSeverity(value) {
  const severity = String(value ?? "").trim().toLowerCase();
  return FINDING_SEVERITIES.has(severity) ? severity : null;
}

function normalizeConfidence(value) {
  const confidence = String(value ?? "").trim().toLowerCase();
  return CONFIDENCE_LEVELS.has(confidence) ? confidence : null;
}

function normalizeLine(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? number : null;
}

function inferSeverity({ title, body, recommendation }) {
  // Conservative fallback: use explicit severity markers or short titles only, not long review prose.
  const explicit = inferExplicitSeverity([title, body, recommendation].filter(Boolean).join("\n"));
  if (explicit) return explicit;

  const titleText = String(title ?? "").toLowerCase();
  if (hasNegatedSeveritySignal(titleText)) return "info";
  if (/\b(blocker|critical|fatal|p0)\b|^must fix\b|^cannot ship\b|高风险|严重|阻塞/.test(titleText)) {
    return "blocker";
  }
  if (/\b(high|p1|regression)\b|破坏|回归/.test(titleText)) {
    return "high";
  }
  if (/\b(medium|p2|needs-attention|missing|test gap)\b|^should fix\b|需要修复|缺少测试/.test(titleText)) {
    return "medium";
  }
  if (/\b(low|p3|minor|nit)\b|低风险|小问题/.test(titleText)) {
    return "low";
  }
  return "info";
}

function inferExplicitSeverity(value) {
  const text = String(value ?? "");
  const match = text.match(/\b(?:severity|priority)\s*[:=-]\s*(blocker|critical|high|medium|low|info|p0|p1|p2|p3)\b/i);
  if (!match) return null;
  const raw = match[1].toLowerCase();
  if (raw === "critical" || raw === "p0") return "blocker";
  if (raw === "p1") return "high";
  if (raw === "p2") return "medium";
  if (raw === "p3") return "low";
  return normalizeSeverity(raw);
}

function hasNegatedSeveritySignal(value) {
  return /\b(no|not|without|zero)\s+(?:\w+\s+){0,3}(blockers?|blocking|critical|fatal|high|p0|p1|risks?|issues?|findings?)\b/.test(value);
}

function inferVerdict(findings) {
  return findings.some((finding) => finding.severity !== "info") ? "needs-attention" : "approve";
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object" || Array.isArray(item)) return "";
      return firstNonEmptyString([item.title, item.content, item.body, item.summary]);
    })
    .filter(Boolean);
}

function firstNonEmptyString(values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstLine(value) {
  return String(value ?? "").split(/\r?\n/).find((line) => line.trim())?.trim() ?? "";
}
