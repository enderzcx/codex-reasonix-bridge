#!/usr/bin/env node
/**
 * Codex Reasonix MCP server.
 * Thin stdio adapter over the local crb / codex-reasonix-bridge CLI.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const SERVER_NAME = "codex-reasonix";
const SERVER_VERSION = "0.2.0";
const PROTOCOL_VERSION = "2025-03-26";
const SUPPORTED_PROTOCOL_VERSIONS = new Set(["2024-11-05", "2025-03-26", "2025-06-18"]);

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(PLUGIN_ROOT, "../..");
const BUNDLED_CRB = join(REPO_ROOT, "bin", "codex-reasonix-bridge.mjs");

const CWD = {
  type: "string",
  description: "Absolute path of the current host workspace or repository.",
};

const TASK = {
  type: "string",
  minLength: 1,
  description: "Complete task / focus text for Reasonix.",
};

const MODEL = {
  type: "string",
  description:
    "Optional model override. Default routes use deepseek-v4-flash:0731-cloud (Flash formal). Pro preview: deepseek-v4-pro.",
};

const MODE = {
  type: "string",
  enum: [
    "consult",
    "engineering-feedback",
    "engineering-plan",
    "daily-review",
    "final-review",
    "adversarial-review",
    "general",
  ],
  description: "Delegate mode. Review tools default to final-review / daily-review / adversarial-review.",
};

function objectSchema(properties, required = []) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

const TOOLS = [
  {
    name: "reasonix_setup",
    description:
      "Check Reasonix CLI, Ollama/API credentials surface, crb bridge, and default Flash formal model routing.",
    inputSchema: objectSchema({
      cwd: CWD,
      probe_live: {
        type: "boolean",
        default: false,
        description: "If true, run a one-line dry-run/live routing check (no full review).",
      },
    }, ["cwd"]),
  },
  {
    name: "reasonix_consult",
    description:
      "Ask Reasonix / DeepSeek Flash formal for a second opinion or engineering consult. Prefer background for non-trivial questions.",
    inputSchema: objectSchema({
      task: TASK,
      cwd: CWD,
      model: MODEL,
      context: {
        type: "array",
        items: { type: "string" },
        description: "Optional short context strings.",
      },
      background: {
        type: "boolean",
        default: true,
        description: "Run as tracked background job (recommended).",
      },
      dry_run: { type: "boolean", default: false },
      timeout_ms: { type: "integer", minimum: 0, maximum: 3_600_000 },
    }, ["task", "cwd"]),
  },
  {
    name: "reasonix_review",
    description:
      "Collect git context (codex-plugin-cc style) and ask Reasonix for a structured engineering review. Default model is Flash formal 0731.",
    inputSchema: objectSchema({
      task: {
        type: "string",
        description: "Review focus text. Optional; defaults to a blocker/high/tests prompt.",
      },
      cwd: CWD,
      mode: {
        type: "string",
        enum: ["final-review", "daily-review", "adversarial-review", "engineering-feedback"],
        default: "final-review",
      },
      model: MODEL,
      base: { type: "string", description: "Git base ref for branch review, e.g. main." },
      scope: {
        type: "string",
        enum: ["auto", "working-tree", "branch"],
        default: "auto",
      },
      compact: {
        type: "boolean",
        default: false,
        description: "Force compact git context for large diffs.",
      },
      context: {
        type: "array",
        items: { type: "string" },
      },
      background: { type: "boolean", default: true },
      dry_run: { type: "boolean", default: false },
      timeout_ms: { type: "integer", minimum: 0, maximum: 3_600_000 },
    }, ["cwd"]),
  },
  {
    name: "reasonix_delegate",
    description:
      "General Reasonix delegate with an explicit mode. Use when consult/review helpers are not enough.",
    inputSchema: objectSchema({
      task: TASK,
      cwd: CWD,
      mode: MODE,
      model: MODEL,
      context: {
        type: "array",
        items: { type: "string" },
      },
      background: { type: "boolean", default: true },
      dry_run: { type: "boolean", default: false },
      timeout_ms: { type: "integer", minimum: 0, maximum: 3_600_000 },
    }, ["task", "cwd"]),
  },
  {
    name: "reasonix_status",
    description: "List or inspect Reasonix bridge jobs for a workspace.",
    inputSchema: objectSchema({
      cwd: CWD,
      job_id: { type: "string", description: "Optional job id or prefix." },
      all: { type: "boolean", default: false },
    }, ["cwd"]),
  },
  {
    name: "reasonix_result",
    description: "Read a finished Reasonix job result (rendered + structured when available).",
    inputSchema: objectSchema({
      cwd: CWD,
      job_id: { type: "string", description: "Optional job id or prefix; latest finished job if omitted." },
    }, ["cwd"]),
  },
  {
    name: "reasonix_cancel",
    description: "Cancel an active Reasonix background job.",
    inputSchema: objectSchema({
      cwd: CWD,
      job_id: { type: "string", minLength: 1 },
    }, ["cwd", "job_id"]),
  },
  {
    name: "reasonix_models",
    description: "List configured Reasonix bridge model catalog and aliases.",
    inputSchema: objectSchema({ cwd: CWD }, ["cwd"]),
  },
];

function resolveCrb() {
  if (process.env.CRB_BIN && existsSync(process.env.CRB_BIN)) {
    return { command: process.env.CRB_BIN, argsPrefix: [], label: process.env.CRB_BIN };
  }
  if (existsSync(BUNDLED_CRB)) {
    return { command: process.execPath, argsPrefix: [BUNDLED_CRB], label: BUNDLED_CRB };
  }
  const which = spawnSync("which", ["crb"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) {
    return { command: which.stdout.trim(), argsPrefix: [], label: which.stdout.trim() };
  }
  throw new Error(
    `crb bridge not found. Expected ${BUNDLED_CRB} or CRB_BIN / PATH crb.`,
  );
}

function resolveCwd(value) {
  if (!value || typeof value !== "string") throw new Error("cwd is required");
  const cwd = resolve(value);
  if (!existsSync(cwd)) throw new Error(`cwd does not exist: ${cwd}`);
  return cwd;
}

function invokeCrb(cwd, args, { timeoutMs = 180_000 } = {}) {
  const crb = resolveCrb();
  const child = spawn(crb.command, [...crb.argsPrefix, ...args], {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  return new Promise((resolvePromise) => {
    let timedOut = false;
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
            setTimeout(() => child.kill("SIGKILL"), 2000).unref?.();
          }, timeoutMs)
        : null;
    timer?.unref?.();
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      let payload = null;
      if (stdout.trim()) {
        try {
          payload = JSON.parse(stdout);
        } catch {
          payload = { text: stdout.trim() };
        }
      }
      if (timedOut) {
        resolvePromise({
          code: code ?? 124,
          payload: {
            ok: false,
            error: `crb timed out after ${timeoutMs}ms`,
            stdout_tail: stdout.slice(-2000),
            stderr_tail: stderr.slice(-2000),
          },
          stdout,
          stderr,
        });
        return;
      }
      resolvePromise({ code: code ?? 0, payload, stdout, stderr });
    });
  });
}

function pushContextFlags(args, context) {
  if (!Array.isArray(context)) return;
  for (const item of context) {
    if (item) args.push("--context", String(item));
  }
}

async function callTool(name, args) {
  if (name === "reasonix_setup") {
    const cwd = resolveCwd(args.cwd);
    const crb = resolveCrb();
    const reasonix = spawnSync("which", ["reasonix"], { encoding: "utf8" });
    const models = await invokeCrb(cwd, ["models"], { timeoutMs: 15_000 });
    const dry = args.probe_live
      ? await invokeCrb(
          cwd,
          ["delegate", "--mode", "general", "--dry-run", "--json", "setup probe"],
          { timeoutMs: 30_000 },
        )
      : null;
    return {
      code: 0,
      payload: {
        ok: true,
        server: { name: SERVER_NAME, version: SERVER_VERSION },
        plugin_root: PLUGIN_ROOT,
        crb: crb.label,
        reasonix: reasonix.status === 0 ? reasonix.stdout.trim() : null,
        reasonix_home: join(homedir(), ".reasonix"),
        default_model: "deepseek-v4-flash:0731-cloud",
        models: models.payload,
        probe: dry?.payload ?? null,
        notes: [
          "Default review/consult model is DeepSeek V4 Flash formal (deepseek-v4-flash:0731-cloud).",
          "Pro preview is optional via model=deepseek-v4-pro.",
          "Host keeps final engineering judgment.",
        ],
      },
      stdout: "",
      stderr: "",
    };
  }

  if (name === "reasonix_models") {
    const cwd = resolveCwd(args.cwd);
    return invokeCrb(cwd, ["models"], { timeoutMs: 15_000 });
  }

  if (name === "reasonix_status") {
    const cwd = resolveCwd(args.cwd);
    const cmd = ["status", "--json", "--cwd", cwd];
    if (args.all) cmd.push("--all");
    if (args.job_id) cmd.push(String(args.job_id));
    return invokeCrb(cwd, cmd, { timeoutMs: 30_000 });
  }

  if (name === "reasonix_result") {
    const cwd = resolveCwd(args.cwd);
    const cmd = ["result", "--json", "--cwd", cwd];
    if (args.job_id) cmd.push(String(args.job_id));
    return invokeCrb(cwd, cmd, { timeoutMs: 30_000 });
  }

  if (name === "reasonix_cancel") {
    const cwd = resolveCwd(args.cwd);
    return invokeCrb(cwd, ["cancel", "--json", "--cwd", cwd, String(args.job_id)], {
      timeoutMs: 30_000,
    });
  }

  if (name === "reasonix_consult" || name === "reasonix_delegate") {
    const cwd = resolveCwd(args.cwd);
    const mode = name === "reasonix_consult" ? "consult" : args.mode || "general";
    const cmd = ["delegate", "--mode", mode, "--json"];
    if (args.model) cmd.push("--model", String(args.model));
    if (args.dry_run) cmd.push("--dry-run");
    if (args.background !== false && !args.dry_run) cmd.push("--background");
    if (args.timeout_ms !== undefined) cmd.push("--timeout-ms", String(args.timeout_ms));
    pushContextFlags(cmd, args.context);
    cmd.push(String(args.task));
    const timeoutMs =
      args.background === false && !args.dry_run
        ? Number(args.timeout_ms ?? 180_000)
        : 60_000;
    return invokeCrb(cwd, cmd, { timeoutMs });
  }

  if (name === "reasonix_review") {
    const cwd = resolveCwd(args.cwd);
    const cmd = ["review", "--json", "--mode", args.mode || "final-review"];
    if (args.model) cmd.push("--model", String(args.model));
    if (args.base) cmd.push("--base", String(args.base));
    if (args.scope) cmd.push("--scope", String(args.scope));
    if (args.compact) cmd.push("--compact");
    if (args.dry_run) cmd.push("--dry-run");
    if (args.background !== false && !args.dry_run) cmd.push("--background");
    if (args.timeout_ms !== undefined) cmd.push("--timeout-ms", String(args.timeout_ms));
    pushContextFlags(cmd, args.context);
    if (args.task) cmd.push(String(args.task));
    const timeoutMs =
      args.background === false && !args.dry_run
        ? Number(args.timeout_ms ?? 300_000)
        : 120_000;
    return invokeCrb(cwd, cmd, { timeoutMs });
  }

  throw new Error(`unknown tool: ${name}`);
}

function validateToolArguments(name, args) {
  const tool = TOOLS.find((item) => item.name === name);
  if (!tool) throw new Error(`unknown tool: ${name}`);
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("tool arguments must be an object");
  }
  const schema = tool.inputSchema;
  for (const key of schema.required || []) {
    if (args[key] === undefined || args[key] === null || args[key] === "") {
      throw new Error(`${key} is required`);
    }
  }
  for (const [key, value] of Object.entries(args)) {
    const definition = schema.properties?.[key];
    if (!definition) throw new Error(`unknown argument: ${key}`);
    if (definition.type === "boolean" && typeof value !== "boolean") {
      throw new Error(`${key} must be a boolean`);
    }
    if (definition.type === "string" && typeof value !== "string") {
      throw new Error(`${key} must be a string`);
    }
    if (definition.type === "integer") {
      if (!Number.isInteger(value)) throw new Error(`${key} must be an integer`);
      if (definition.minimum !== undefined && value < definition.minimum) {
        throw new Error(`${key} must be >= ${definition.minimum}`);
      }
      if (definition.maximum !== undefined && value > definition.maximum) {
        throw new Error(`${key} must be <= ${definition.maximum}`);
      }
    }
    if (definition.type === "array" && !Array.isArray(value)) {
      throw new Error(`${key} must be an array`);
    }
    if (definition.enum && !definition.enum.includes(value)) {
      throw new Error(`${key} must be one of: ${definition.enum.join(", ")}`);
    }
  }
}

function toolResult(code, payload, stdout, stderr) {
  const text =
    typeof payload === "object" && payload !== null
      ? JSON.stringify(payload, null, 2)
      : String(payload || stdout || stderr || `crb exited with code ${code}`);
  const result = {
    content: [{ type: "text", text }],
    isError: code !== 0,
  };
  if (payload && typeof payload === "object") result.structuredContent = payload;
  if (stderr) result._meta = { stderr: stderr.slice(-4000) };
  return result;
}

async function handleRequest(message) {
  const method = message.method;
  const requestId = message.id;
  if (requestId === undefined || requestId === null) return null;

  try {
    if (method === "initialize") {
      const params = message.params || {};
      const requested = params.protocolVersion;
      const negotiated = SUPPORTED_PROTOCOL_VERSIONS.has(requested)
        ? requested
        : PROTOCOL_VERSION;
      return {
        id: requestId,
        result: {
          protocolVersion: negotiated,
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
          },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          instructions:
            "Codex Reasonix bridges Codex to Reasonix/DeepSeek. Default model is Flash formal deepseek-v4-flash:0731-cloud. Prefer reasonix_review for diffs and reasonix_consult for second opinions. Launch non-trivial work with background=true, then reasonix_status/result. Host keeps final judgment.",
        },
      };
    }
    if (method === "ping") return { id: requestId, result: {} };
    if (method === "tools/list") return { id: requestId, result: { tools: TOOLS } };
    if (method === "resources/list") return { id: requestId, result: { resources: [] } };
    if (method === "resources/templates/list") {
      return { id: requestId, result: { resourceTemplates: [] } };
    }
    if (method === "tools/call") {
      const params = message.params || {};
      const name = params.name;
      const arguments_ = params.arguments || {};
      if (typeof name !== "string") throw new Error("tool name is required");
      if (!arguments_ || typeof arguments_ !== "object") {
        throw new Error("tool arguments must be an object");
      }
      validateToolArguments(name, arguments_);
      const { code, payload, stdout, stderr } = await callTool(name, arguments_);
      return {
        id: requestId,
        result: toolResult(code, payload, stdout, stderr),
      };
    }
    return {
      id: requestId,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  } catch (error) {
    return {
      id: requestId,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    writeMessage({
      error: { code: -32700, message: "Parse error" },
    });
    return;
  }
  const response = await handleRequest(message);
  if (response) writeMessage(response);
});
