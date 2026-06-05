import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { stat } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { collectReviewContext, resolveReviewTarget } from "./git-context.mjs";
import { buildSystemPrompt, buildUserPrompt } from "./prompts.mjs";
import { renderDelegateResult } from "./render.mjs";
import { runDelegateModel } from "./reasonix.mjs";
import { isStructuredReviewMode, validateReviewOutput } from "./review-schema.mjs";
import { DELEGATE_MODES, MODEL_CATALOG, normalizeMode, resolveRoute, routeMetadata } from "./routes.mjs";
import {
  appendLog,
  createJob,
  generateJobId,
  isActiveStatus,
  listJobs,
  nowIso,
  readJob,
  resolveJobLogFile,
  resolveJobReference,
  resolveWorkspaceRoot,
  updateJob,
} from "./state.mjs";

const INPUT_FILE_BYTE_CAP = 48 * 1024;

export async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command === "delegate") {
    await delegate(rest);
    return;
  }
  if (command === "consult" || command === "ask") {
    await consult(rest);
    return;
  }
  if (command === "review") {
    await review(rest);
    return;
  }
  if (command === "job-worker") {
    await jobWorker(rest);
    return;
  }
  if (command === "status") {
    status(rest);
    return;
  }
  if (command === "result") {
    result(rest);
    return;
  }
  if (command === "cancel") {
    cancel(rest);
    return;
  }
  if (command === "models") {
    stdout.write(`${JSON.stringify(MODEL_CATALOG, null, 2)}\n`);
    return;
  }
  if (command === "modes") {
    stdout.write(`${DELEGATE_MODES.join("\n")}\n`);
    return;
  }
  throw new Error(`unknown command: ${command}`);
}

export async function delegate(argv) {
  const opts = parseDelegateArgs(argv);
  const task = opts.task || (await readStdinIfPiped());
  await runPreparedDelegate({ opts, task, files: opts.inputFiles.map(readInputFile) });
}

export async function consult(argv) {
  const opts = parseDelegateArgs(["--mode", "consult", ...argv]);
  const task = opts.task || (await readStdinIfPiped());
  await runPreparedDelegate({ opts, task, files: opts.inputFiles.map(readInputFile) });
}

async function runPreparedDelegate({ opts, task, files }) {
  const mode = normalizeMode(opts.mode);
  const route = resolveRoute({ mode, model: opts.model });
  const metadata = routeMetadata(route);

  if (opts.dryRun) {
    writeJson({
      mode,
      routing: metadata,
      task: task || null,
      input_files: files.map((file) => ({ path: file.path, bytes: file.bytes, truncated: file.truncated })),
    });
    return;
  }

  if (opts.background) {
    enqueueBackgroundDelegate({ opts, task, mode, route, metadata, files });
    return;
  }

  const output = await runDelegateRequest({ opts, task, mode, route, metadata, files });
  if (opts.json) writeJson(output.wrapped);
  else writeText(output.raw);
}

export async function review(argv) {
  const opts = parseReviewArgs(argv);
  const target = resolveReviewTarget(process.cwd(), { base: opts.base, scope: opts.scope });
  const reviewContext = collectReviewContext(process.cwd(), target, { style: opts.compact ? "compact" : "auto" });
  const task = [
    opts.task || "Review the attached git context for material blockers, high-risk regressions, and missing tests.",
    "",
    "Important:",
    "- The attached git context is the review input collected by crb, following the codex-plugin-cc pattern.",
    "- If the attached context is truncated or insufficient, say [NEEDS_INPUT] and name the exact missing file/diff/context.",
  ].join("\n");
  const files = [{
    path: reviewContext.path,
    content: reviewContext.content,
    bytes: reviewContext.bytes,
    truncated: reviewContext.truncated,
  }];
  const contexts = [
    `review target: ${target.label}`,
    `repo root: ${reviewContext.repoRoot}`,
    reviewContext.summary,
    `review context style: ${reviewContext.contextStyle}`,
    reviewContext.truncated
      ? `review context truncated from ${reviewContext.bytes} bytes to ${Buffer.byteLength(reviewContext.content, "utf8")} bytes`
      : `review context bytes: ${reviewContext.bytes}`,
  ];
  await runPreparedDelegate({
    opts: {
      ...opts,
      contexts: [...contexts, ...opts.contexts],
      inputFiles: [],
    },
    task,
    files,
  });
}

async function runDelegateRequest({ opts, task, mode, route, metadata, files }) {
  const system = buildSystemPrompt(mode, opts.json);
  const prompt = buildUserPrompt({ task, contexts: opts.contexts, files });
  const result = await runDelegateModel({
    reasonixBin: opts.reasonixBin,
    model: route.model,
    effort: opts.effort,
    system,
    prompt,
    json: opts.json,
    noProxy: opts.noProxy,
    timeoutMs: opts.timeoutMs,
    isolateRuntime: opts.isolateRuntime,
  });

  const wrapped = wrapJsonOutput(result.stdout, mode, metadata);
  return {
    raw: result.stdout,
    stderr: result.stderr,
    wrapped,
    rendered: renderDelegateResult(wrapped, { raw: result.stdout }),
  };
}

function writeText(value) {
  stdout.write(value);
  if (!value.endsWith("\n")) stdout.write("\n");
}

function enqueueBackgroundDelegate({ opts, task, mode, route, metadata, files }) {
  const cwd = resolve(process.cwd());
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const jobId = generateJobId(metadata.output_kind === "discussion" ? "consult" : "review");
  const logFile = resolveJobLogFile(workspaceRoot, jobId);
  const job = createJob(workspaceRoot, {
    id: jobId,
    kind: "delegate",
    title: `Reasonix ${mode}`,
    summary: task ? task.replace(/\s+/g, " ").slice(0, 120) : `${mode} review`,
    workspaceRoot,
    status: "queued",
    phase: "queued",
    pid: null,
    logFile,
    routing: metadata,
    request: {
      opts: {
        mode: opts.mode,
        contexts: opts.contexts,
        json: true,
        noProxy: opts.noProxy,
        isolateRuntime: opts.isolateRuntime,
        model: opts.model,
        effort: opts.effort,
        reasonixBin: opts.reasonixBin,
        timeoutMs: opts.timeoutMs ?? 0,
      },
      task,
      mode,
      route,
      metadata,
      files,
    },
  });
  appendLog(workspaceRoot, jobId, `Queued ${mode} with ${metadata.selected_model}.`);
  const child = spawn(process.execPath, [process.argv[1], "job-worker", "--cwd", workspaceRoot, "--job-id", jobId], {
    cwd: workspaceRoot,
    env: process.env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  updateJob(workspaceRoot, job.id, { pid: child.pid ?? null });

  const payload = {
    job_id: jobId,
    status: "queued",
    mode,
    selected_model: metadata.selected_model,
    commands: {
      status: `crb status ${jobId}`,
      result: `crb result ${jobId}`,
      cancel: `crb cancel ${jobId}`,
    },
  };
  if (opts.json) writeJson(payload);
  else writeText(`Reasonix delegate started in the background as ${jobId}. Check \`crb status ${jobId}\` for progress.`);
}

export function parseDelegateArgs(argv) {
  const opts = {
    mode: "general",
    inputFiles: [],
    contexts: [],
    json: false,
    dryRun: false,
    background: false,
    noProxy: false,
    isolateRuntime: true,
    model: undefined,
    effort: undefined,
    reasonixBin: undefined,
    timeoutMs: undefined,
    task: "",
  };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--mode") opts.mode = requireValue(argv, ++i, "--mode");
    else if (arg === "--input") opts.inputFiles.push(requireValue(argv, ++i, "--input"));
    else if (arg === "--context") opts.contexts.push(requireValue(argv, ++i, "--context"));
    else if (arg === "--json") opts.json = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--background") opts.background = true;
    else if (arg === "--no-proxy") opts.noProxy = true;
    else if (arg === "--no-isolate-runtime") opts.isolateRuntime = false;
    else if (arg === "--model" || arg === "-m") opts.model = requireValue(argv, ++i, arg);
    else if (arg === "--effort") opts.effort = requireValue(argv, ++i, "--effort");
    else if (arg === "--timeout-ms") opts.timeoutMs = parseTimeoutMs(requireValue(argv, ++i, "--timeout-ms"));
    else if (arg === "--reasonix-bin") opts.reasonixBin = requireValue(argv, ++i, "--reasonix-bin");
    else if (arg === "--help" || arg === "-h") {
      printDelegateHelp();
      process.exit(0);
    } else positional.push(arg);
  }
  opts.task = positional.join(" ").trim();
  return opts;
}

export function parseReviewArgs(argv) {
  const opts = {
    mode: "final-review",
    scope: "auto",
    base: undefined,
    inputFiles: [],
    contexts: [],
    json: false,
    dryRun: false,
    background: false,
    compact: false,
    noProxy: false,
    isolateRuntime: true,
    model: undefined,
    effort: undefined,
    reasonixBin: undefined,
    timeoutMs: undefined,
    task: "",
  };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--mode") opts.mode = requireValue(argv, ++i, "--mode");
    else if (arg === "--scope") opts.scope = requireValue(argv, ++i, "--scope");
    else if (arg === "--base") opts.base = requireValue(argv, ++i, "--base");
    else if (arg === "--context") opts.contexts.push(requireValue(argv, ++i, "--context"));
    else if (arg === "--json") opts.json = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--background") opts.background = true;
    else if (arg === "--compact") opts.compact = true;
    else if (arg === "--no-proxy") opts.noProxy = true;
    else if (arg === "--no-isolate-runtime") opts.isolateRuntime = false;
    else if (arg === "--model" || arg === "-m") opts.model = requireValue(argv, ++i, arg);
    else if (arg === "--effort") opts.effort = requireValue(argv, ++i, "--effort");
    else if (arg === "--timeout-ms") opts.timeoutMs = parseTimeoutMs(requireValue(argv, ++i, "--timeout-ms"));
    else if (arg === "--reasonix-bin") opts.reasonixBin = requireValue(argv, ++i, "--reasonix-bin");
    else if (arg === "--help" || arg === "-h") {
      printReviewHelp();
      process.exit(0);
    } else positional.push(arg);
  }
  opts.task = positional.join(" ").trim();
  return opts;
}

async function jobWorker(argv) {
  const opts = parseSimpleArgs(argv, ["cwd", "job-id"], []);
  const cwd = opts.cwd ? resolve(opts.cwd) : process.cwd();
  const jobId = opts["job-id"];
  if (!jobId) throw new Error("job-worker requires --job-id");
  const stored = readJob(cwd, jobId);
  if (!stored?.request) throw new Error(`job ${jobId} is missing request data`);
  updateJob(cwd, jobId, { status: "running", phase: "running", pid: process.pid, startedAt: nowIso() });
  appendLog(cwd, jobId, "Worker started.");
  try {
    const output = await runDelegateRequest(stored.request);
    updateJob(cwd, jobId, {
      status: "completed",
      phase: "done",
      pid: null,
      completedAt: nowIso(),
      result: output.wrapped,
      rendered: output.rendered,
      raw: output.raw,
      stderr: output.stderr,
      summary: output.wrapped.summary ?? "Reasonix delegate completed.",
    });
    appendParseStatusLog(cwd, jobId, output.wrapped);
    appendLog(cwd, jobId, "Worker completed.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateJob(cwd, jobId, {
      status: "failed",
      phase: "failed",
      pid: null,
      completedAt: nowIso(),
      error: message,
    });
    appendLog(cwd, jobId, `Worker failed: ${message}`);
    process.exitCode = 1;
  }
}

function appendParseStatusLog(cwd, jobId, result) {
  const status = result?.parse_status;
  if (!status) return;
  if (status === "raw-fallback" || status === "schema-fallback") {
    appendLog(cwd, jobId, `Output parse status: ${status}; raw output preserved in job record.`);
  } else {
    appendLog(cwd, jobId, `Output parse status: ${status}${result?.parse_source ? ` (${result.parse_source})` : ""}.`);
  }
}

function status(argv) {
  const opts = parseSimpleArgs(argv, ["cwd"], ["json", "all"]);
  const cwd = opts.cwd ? resolve(opts.cwd) : resolveWorkspaceRoot(process.cwd());
  const reference = opts._[0] ?? "";
  const jobs = reference ? [resolveJobReference(cwd, reference)].filter(Boolean) : listJobs(cwd).slice(0, opts.all ? 50 : 10);
  if (opts.json) {
    writeJson({ jobs });
    return;
  }
  if (!jobs.length) {
    writeText("No Reasonix bridge jobs found.");
    return;
  }
  writeText([
    "| Job | Status | Mode | Model | Summary | Actions |",
    "|---|---|---|---|---|---|",
    ...jobs.map((job) => {
      const actions = isActiveStatus(job.status)
        ? `\`crb cancel ${job.id}\``
        : `\`crb result ${job.id}\``;
      return `| ${job.id} | ${job.status ?? ""} | ${job.routing?.mode ?? ""} | ${job.routing?.selected_model ?? ""} | ${escapeCell(job.summary ?? "")} | ${actions} |`;
    }),
  ].join("\n"));
}

function result(argv) {
  const opts = parseSimpleArgs(argv, ["cwd"], ["json"]);
  const cwd = opts.cwd ? resolve(opts.cwd) : resolveWorkspaceRoot(process.cwd());
  const reference = opts._[0] ?? "";
  const job = resolveJobReference(cwd, reference, (candidate) => !isActiveStatus(candidate.status));
  if (!job) throw new Error(reference ? `No finished job found for ${reference}` : "No finished Reasonix bridge job found.");
  const stored = readJob(cwd, job.id) ?? job;
  if (opts.json) {
    writeJson(stored);
    return;
  }
  if (stored.status === "failed") {
    writeText(`Job ${stored.id} failed: ${stored.error ?? "unknown error"}`);
    return;
  }
  writeText(stored.rendered ?? renderDelegateResult(stored.result ?? { summary: stored.summary ?? "No result payload stored." }, { raw: stored.raw }));
}

function cancel(argv) {
  const opts = parseSimpleArgs(argv, ["cwd"], ["json"]);
  const cwd = opts.cwd ? resolve(opts.cwd) : resolveWorkspaceRoot(process.cwd());
  const reference = opts._[0] ?? "";
  const job = resolveJobReference(cwd, reference, (candidate) => isActiveStatus(candidate.status));
  if (!job) throw new Error(reference ? `No active job found for ${reference}` : "No active Reasonix bridge job found.");
  const pid = Number(job.pid);
  let signalSent = false;
  if (Number.isFinite(pid) && pid > 0) {
    try {
      process.kill(-pid, "SIGTERM");
      signalSent = true;
    } catch {
      try {
        process.kill(pid, "SIGTERM");
        signalSent = true;
      } catch {
        signalSent = false;
      }
    }
  }
  const next = updateJob(cwd, job.id, {
    status: "cancelled",
    phase: "cancelled",
    pid: null,
    completedAt: nowIso(),
    error: "Cancelled by user.",
  });
  appendLog(cwd, job.id, "Cancelled by user.");
  const payload = { job_id: job.id, status: "cancelled", signal_sent: signalSent };
  if (opts.json) writeJson({ ...payload, job: next });
  else writeText(`Cancelled ${job.id}${signalSent ? "" : " (process was already gone)"}.`);
}

function parseSimpleArgs(argv, valueOptions = [], booleanOptions = []) {
  const valueSet = new Set(valueOptions.map((name) => `--${name}`));
  const boolSet = new Set(booleanOptions.map((name) => `--${name}`));
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (valueSet.has(arg)) opts[arg.slice(2)] = requireValue(argv, ++i, arg);
    else if (boolSet.has(arg)) opts[arg.slice(2)] = true;
    else opts._.push(arg);
  }
  return opts;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseTimeoutMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("--timeout-ms must be a non-negative number");
  return parsed;
}

function readInputFile(path) {
  const content = readFileSync(path, "utf8");
  const truncated = Buffer.byteLength(content, "utf8") > INPUT_FILE_BYTE_CAP;
  const sliced = truncated ? Buffer.from(content).subarray(0, INPUT_FILE_BYTE_CAP).toString("utf8") : content;
  return {
    path,
    content: sliced,
    bytes: Buffer.byteLength(content, "utf8"),
    truncated,
  };
}

async function readStdinIfPiped() {
  try {
    const info = await stat("/dev/stdin");
    if (info.isFIFO() || info.isFile()) {
      return await new Promise((resolve) => {
        let data = "";
        stdin.setEncoding("utf8");
        stdin.on("data", (chunk) => {
          data += chunk;
        });
        stdin.on("end", () => resolve(data.trim()));
      });
    }
  } catch {
    return "";
  }
  return "";
}

export function wrapJsonOutput(raw, mode, routing) {
  const extracted = extractJsonObject(raw);
  if (extracted?.parsed) {
    const parsed = extracted.parsed;
    const notes = Array.isArray(parsed.notes) ? [...parsed.notes] : [];
    if (extracted.source !== "direct") {
      notes.push("Bridge extracted structured JSON from mixed Reasonix output.");
    }
    if (isStructuredReviewMode(mode)) {
      const validation = validateReviewOutput(parsed);
      if (!validation.ok) {
        return {
          mode,
          routing,
          parse_status: "schema-fallback",
          parse_source: extracted.source,
          summary: "Delegate model returned JSON that did not match the review schema.",
          deliverables: [{ type: "note", title: "raw", content: raw.trim() }],
          notes: [
            "The bridge preserved the raw response because review schema validation failed.",
            ...validation.errors,
            ...notes,
          ],
          next_for_codex: [],
        };
      }
      return {
        ...validation.value,
        mode: parsed.mode ?? mode,
        routing,
        parse_status: extracted.source === "direct" ? "parsed" : "extracted",
        parse_source: extracted.source,
        ...(notes.length ? { notes } : {}),
      };
    }
    return {
      ...parsed,
      mode: parsed.mode ?? mode,
      routing,
      parse_status: extracted.source === "direct" ? "parsed" : "extracted",
      parse_source: extracted.source,
      ...(notes.length ? { notes } : {}),
    };
  }
  return {
    mode,
    routing,
    parse_status: "raw-fallback",
    parse_source: "raw",
    summary: "Delegate model returned non-JSON content.",
    deliverables: [{ type: "note", title: "raw", content: raw.trim() }],
    notes: ["The bridge wrapped the raw response because JSON parsing failed."],
    next_for_codex: [],
  };
}

export function extractJsonObject(raw) {
  const trimmed = stripAnsi(String(raw ?? "")).trim();
  if (!trimmed) return null;
  const direct = parseJsonCandidate(trimmed);
  if (direct) return { parsed: direct, source: "direct" };

  const fencedCandidates = extractFencedCandidates(trimmed);
  const fenced = chooseBestParsedObject(fencedCandidates, { minScore: 1 });
  if (fenced) return { parsed: fenced, source: "fenced" };

  const balanced = chooseBestParsedObject(extractBalancedObjectCandidates(trimmed), { minScore: 1 });
  if (balanced) return { parsed: balanced, source: "balanced" };

  return null;
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function parseJsonCandidate(candidate) {
  try {
    const parsed = JSON.parse(candidate.trim());
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractFencedCandidates(raw) {
  const candidates = [];
  const fencePattern = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
  let match;
  while ((match = fencePattern.exec(raw)) !== null) {
    if (match[1]?.trim()) candidates.push(match[1].trim());
  }
  return candidates;
}

function extractBalancedObjectCandidates(raw) {
  const candidates = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(raw.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return candidates;
}

function chooseBestParsedObject(candidates, { minScore = 0 } = {}) {
  let best = null;
  for (const candidate of candidates) {
    const parsed = parseJsonCandidate(candidate);
    if (!parsed) continue;
    const score = scoreParsedObject(parsed);
    if (score < minScore) continue;
    if (!best || score > best.score || (score === best.score && candidate.length > best.length)) {
      best = { parsed, score, length: candidate.length };
    }
  }
  return best?.parsed ?? null;
}

function scoreParsedObject(value) {
  let score = 0;
  if (typeof value.summary === "string") score += 4;
  if (Array.isArray(value.deliverables)) score += 4;
  if (Array.isArray(value.next_for_codex)) score += 3;
  if (Array.isArray(value.notes)) score += 2;
  if (typeof value.verdict === "string") score += 2;
  if (Array.isArray(value.findings)) score += 2;
  if (typeof value.mode === "string") score += 1;
  if (value.routing && typeof value.routing === "object") score += 1;
  return score;
}

function writeJson(value) {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function escapeCell(value) {
  return String(value ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|").slice(0, 160);
}

function printHelp() {
  stdout.write(`codex-reasonix-bridge

Commands:
  consult [task]    Ask Reasonix / DeepSeek to discuss a question with Codex.
  ask [task]        Alias for consult.
  delegate [task]   Ask Reasonix / DeepSeek for consultation, review, or final judgment.
  review [focus]    Collect git context like codex-plugin-cc, then ask Reasonix for review.
  status [job-id]   Show background jobs.
  result [job-id]   Show a completed background result.
  cancel [job-id]   Cancel an active background job.
  modes             List delegate modes.
  models            Print model catalog JSON.

Run "codex-reasonix-bridge delegate --help" for delegate options.
Run "codex-reasonix-bridge review --help" for git review options.
`);
}

function printDelegateHelp() {
  stdout.write(`Usage:
  codex-reasonix-bridge delegate [options] [task]

Options:
  --mode <mode>          ${DELEGATE_MODES.join(" | ")}
  --input <path>         Attach an input file; repeatable.
  --context <text>       Add short context; repeatable.
  --json                 Ask for and emit stable JSON.
  --background           Run as a tracked background job. Use for non-trivial consult/review tasks.
  -m, --model <id>       Override routed model.
  --effort <level>       low | medium | high | max.
  --timeout-ms <ms>      Kill a stuck Reasonix run after this many ms. Default: 180000.
  --dry-run              Print route metadata without calling Reasonix.
  --reasonix-bin <path>  Override Reasonix executable.
  --no-proxy             Pass --no-proxy to Reasonix.
  --no-isolate-runtime   Let Reasonix read normal ~/.reasonix config and MCP tools. Not recommended for review.
`);
}

function printReviewHelp() {
  stdout.write(`Usage:
  codex-reasonix-bridge review [options] [focus text]

Options:
  --scope <scope>        auto | working-tree | branch. Default: auto.
  --base <ref>           Review branch diff against a base ref.
  --mode <mode>          final-review | adversarial-review | daily-review | engineering-feedback. Default: final-review.
  --context <text>       Add short context; repeatable.
  --compact              Use compact git context immediately; auto mode also compacts when full context exceeds the byte cap.
  --json                 Ask for and emit stable JSON.
  --background           Run as a tracked background job. Recommended for non-trivial reviews.
  -m, --model <id>       Override routed model.
  --effort <level>       low | medium | high | max.
  --timeout-ms <ms>      Kill a stuck Reasonix run after this many ms. Default: 180000.
  --dry-run              Print collected route/input metadata without calling Reasonix.
  --reasonix-bin <path>  Override Reasonix executable.
  --no-proxy             Pass --no-proxy to Reasonix.
  --no-isolate-runtime   Let Reasonix read normal ~/.reasonix config and MCP tools. Not recommended for review.
`);
}
