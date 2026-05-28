import { readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { buildSystemPrompt, buildUserPrompt } from "./prompts.mjs";
import { runDelegateModel } from "./reasonix.mjs";
import { DELEGATE_MODES, MODEL_CATALOG, normalizeMode, resolveRoute, routeMetadata } from "./routes.mjs";

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
  const mode = normalizeMode(opts.mode);
  const route = resolveRoute({ mode, model: opts.model });
  const metadata = routeMetadata(route);
  const files = opts.inputFiles.map(readInputFile);

  if (opts.dryRun) {
    writeJson({
      mode,
      routing: metadata,
      task: task || null,
      input_files: files.map((file) => ({ path: file.path, bytes: file.bytes, truncated: file.truncated })),
    });
    return;
  }

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
  });

  if (!opts.json) {
    stdout.write(result.stdout);
    if (!result.stdout.endsWith("\n")) stdout.write("\n");
    return;
  }

  writeJson(wrapJsonOutput(result.stdout, mode, metadata));
}

export function parseDelegateArgs(argv) {
  const opts = {
    mode: "general",
    inputFiles: [],
    contexts: [],
    json: false,
    dryRun: false,
    noProxy: false,
    model: undefined,
    effort: undefined,
    reasonixBin: undefined,
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
    else if (arg === "--no-proxy") opts.noProxy = true;
    else if (arg === "--model" || arg === "-m") opts.model = requireValue(argv, ++i, arg);
    else if (arg === "--effort") opts.effort = requireValue(argv, ++i, "--effort");
    else if (arg === "--reasonix-bin") opts.reasonixBin = requireValue(argv, ++i, "--reasonix-bin");
    else if (arg === "--help" || arg === "-h") {
      printDelegateHelp();
      process.exit(0);
    } else positional.push(arg);
  }
  opts.task = positional.join(" ").trim();
  return opts;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
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
  const parsed = parseJsonObject(raw);
  if (parsed) {
    return {
      mode,
      routing,
      ...parsed,
      mode: parsed.mode ?? mode,
      routing,
    };
  }
  return {
    mode,
    routing,
    summary: "Delegate model returned non-JSON content.",
    deliverables: [{ type: "note", title: "raw", content: raw.trim() }],
    notes: ["The bridge wrapped the raw response because JSON parsing failed."],
    next_for_codex: [],
  };
}

function parseJsonObject(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function writeJson(value) {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp() {
  stdout.write(`codex-reasonix-bridge

Commands:
  delegate [task]   Ask Reasonix / DeepSeek for engineering review or final judgment.
  modes             List delegate modes.
  models            Print model catalog JSON.

Run "codex-reasonix-bridge delegate --help" for delegate options.
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
  -m, --model <id>       Override routed model.
  --effort <level>       low | medium | high | max.
  --dry-run              Print route metadata without calling Reasonix.
  --reasonix-bin <path>  Override Reasonix executable.
  --no-proxy             Pass --no-proxy to Reasonix.
`);
}
