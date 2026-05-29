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
