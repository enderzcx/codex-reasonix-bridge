---
name: codex-reasonix
description: Use Reasonix/Ollama models from Codex for Chinese copy, UI wording, layout direction, visual briefs, naming, human feedback, and engineering second opinions.
---

# codex-reasonix

Use this skill when a Codex task touches:

- Chinese or English product copy
- hero title, subtitle, CTA, empty/error/onboarding/tooltip copy
- landing page information hierarchy
- UI layout direction, visual rhythm, content density
- brand voice, naming, product terminology
- Chinese expression polishing
- public page copy/layout review
- visual reference image briefs
- human-sounding feedback to coworkers or customers
- engineering second opinion when Codex wants a non-Codex perspective

## Command

Prefer:

```bash
codex-reasonix-bridge delegate --mode <mode> --json "<task>"
```

Short alias:

```bash
crb delegate --mode <mode> --json "<task>"
```

Attach files:

```bash
codex-reasonix-bridge delegate --mode ui-review-cn --json \
  --input ./app/page.tsx \
  "审核中文 UI 文案、信息层级和排版节奏"
```

## Modes

- `copywrite`: product copy, headings, subtitles, CTA, empty/error/onboarding states
- `human-feedback`: natural feedback messages to coworkers/customers
- `layout-director`: page IA, module order, visual rhythm
- `frontend-ux-plan`: full UI/UX plan Codex will implement
- `visual-brief`: brief for image generation or UI reference image
- `ui-review-cn`: review Chinese UI language, terminology, hierarchy, layout rhythm
- `rewrite-cn`: polish Chinese writing without changing facts
- `naming`: product, feature, page, action, concept names
- `engineering-feedback`: engineering second opinion
- `engineering-plan`: implementation plan and verification strategy
- `daily-review`: low-cost daily review
- `final-review`: high-value final judgment
- `general`: mixed task fallback

## Discipline

Reasonix output is content/design/review input, not an unconditional patch.

Codex must:

1. Summarize which mode was called.
2. State the main suggestions.
3. Say what was applied or intentionally ignored.
4. Verify any code/UI changes itself.

If the bridge cannot run, state the command attempted and the exact error, then
continue with Codex's own judgment instead of pretending Reasonix was consulted.
