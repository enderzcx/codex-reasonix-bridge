export function renderDelegateResult(payload, { raw = "" } = {}) {
  const result = payload && typeof payload === "object" ? payload : {};
  const lines = [];
  const mode = result.mode ? ` (${result.mode})` : "";
  lines.push(`# Reasonix result${mode}`);

  if (result.summary) {
    lines.push("", String(result.summary).trim());
  }

  if (result.verdict) {
    lines.push("", `Verdict: ${result.verdict}`);
  }

  const findings = Array.isArray(result.findings) ? result.findings : [];
  if (findings.length) {
    lines.push("", "## Findings");
    for (const finding of findings) {
      if (!finding || typeof finding !== "object") continue;
      const severity = finding.severity ? String(finding.severity).toUpperCase() : "INFO";
      lines.push("", `### ${severity}: ${finding.title || "Untitled finding"}`);
      const location = formatLocation(finding);
      if (location) lines.push("", `Location: ${location}`);
      if (finding.confidence) lines.push(`Confidence: ${finding.confidence}`);
      if (finding.body) lines.push("", String(finding.body).trim());
      if (finding.recommendation) lines.push("", `Recommendation: ${String(finding.recommendation).trim()}`);
    }
  }

  const deliverables = Array.isArray(result.deliverables) ? result.deliverables : [];
  for (const item of deliverables) {
    if (!item || typeof item !== "object") continue;
    const title = item.title || item.type || "deliverable";
    lines.push("", `## ${title}`);
    if (item.content) lines.push("", String(item.content).trim());
  }

  const notes = Array.isArray(result.notes) ? result.notes.filter(Boolean) : [];
  if (notes.length) {
    lines.push("", "## Notes");
    for (const note of notes) lines.push(`- ${String(note).trim()}`);
  }

  const next = Array.isArray(result.next_for_codex) ? result.next_for_codex.filter(Boolean) : [];
  const nextSteps = Array.isArray(result.next_steps) ? result.next_steps.filter(Boolean) : [];
  const actions = next.length ? next : nextSteps;
  if (actions.length) {
    lines.push("", "## Next For Codex");
    for (const action of actions) lines.push(`- ${String(action).trim()}`);
  }

  if (result.parse_status === "raw-fallback" || result.parse_status === "schema-fallback") {
    const rawText = raw || deliverables.find((item) => item?.title === "raw")?.content || "";
    lines.push("", "## Raw Model Output");
    lines.push("", String(rawText).trim() || "(empty)");
  }

  return `${lines.join("\n").trim()}\n`;
}

function formatLocation(finding) {
  if (!finding.file) return "";
  const start = finding.line_start;
  const end = finding.line_end;
  if (start && end && start !== end) return `${finding.file}:${start}-${end}`;
  if (start) return `${finding.file}:${start}`;
  return String(finding.file);
}
