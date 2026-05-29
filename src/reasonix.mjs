import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

const APP_NODE = "/Applications/Reasonix.app/Contents/Resources/node";
const APP_CLI = "/Applications/Reasonix.app/Contents/Resources/dist/cli/index.js";
export const DEFAULT_TIMEOUT_MS = 180_000;

export async function runDelegateModel({ reasonixBin, model, effort, system, prompt, noProxy = false, timeoutMs, isolateRuntime = true }) {
  return runReasonix({ reasonixBin, model, effort, system, prompt, noProxy, timeoutMs, isolateRuntime });
}

export function resolveReasonixCommand(reasonixBin = process.env.REASONIX_BIN) {
  if (reasonixBin) return [reasonixBin];

  const found = spawnSync("which", ["reasonix"], { encoding: "utf8" });
  if (found.status === 0 && found.stdout.trim()) return [found.stdout.trim()];

  if (existsSync(APP_NODE) && existsSync(APP_CLI)) return [APP_NODE, APP_CLI];
  throw new Error("Reasonix CLI not found. Install Reasonix.app or set REASONIX_BIN.");
}

export function resolveTimeoutMs(value = process.env.CRB_TIMEOUT_MS ?? process.env.CODEX_REASONIX_TIMEOUT_MS) {
  if (value === undefined || value === null || value === "") return DEFAULT_TIMEOUT_MS;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`invalid Reasonix timeout: ${value}`);
  }
  return parsed;
}

export async function runReasonix({ reasonixBin, model, effort, system, prompt, noProxy = false, timeoutMs = resolveTimeoutMs(), isolateRuntime = true }) {
  const command = resolveReasonixCommand(reasonixBin);
  const args = [...command.slice(1), "run", "-m", model];
  if (effort) args.push("--effort", effort);
  if (system) args.push("--system", system);
  if (noProxy) args.push("--no-proxy");
  if (isolateRuntime) args.push("--no-config");
  args.push(prompt);

  const isolatedHome = isolateRuntime ? mkdtempSync(join(tmpdir(), "crb-reasonix-home-")) : null;
  const child = spawn(command[0], args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: buildReasonixEnv({ isolateRuntime, isolatedHome }),
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

  let timedOut = false;
  let forceKillTimer;
  const timer = timeoutMs > 0
    ? setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
        forceKillTimer.unref?.();
      }, timeoutMs)
    : undefined;
  timer?.unref?.();

  const { code, signal } = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (closeCode, closeSignal) => resolve({ code: closeCode, signal: closeSignal }));
  });
  if (timer) clearTimeout(timer);
  if (forceKillTimer) clearTimeout(forceKillTimer);
  if (isolatedHome) {
    rmSync(isolatedHome, { recursive: true, force: true });
  }

  if (timedOut) {
    const partial = stderr.trim() || stdout.trim();
    const detail = partial ? ` Partial output: ${partial.slice(0, 1000)}` : "";
    throw new Error(
      `Reasonix run timed out after ${timeoutMs}ms with model ${model}. ` +
        "Try a smaller review input, a more targeted prompt, --model deepseek-v4-flash:cloud, or a higher --timeout-ms." +
        detail,
    );
  }

  if (code !== 0) {
    const detail = stderr.trim() || stdout.trim() || `exit code ${code ?? "null"} signal ${signal ?? "none"}`;
    throw new Error(`Reasonix run failed: ${detail}`);
  }
  return { stdout, stderr };
}

function buildReasonixEnv({ isolateRuntime, isolatedHome }) {
  if (!isolateRuntime) return process.env;
  return {
    ...process.env,
    ...readReasonixCredentialEnv(),
    ...(isolatedHome ? { HOME: isolatedHome, USERPROFILE: isolatedHome } : {}),
  };
}

function readReasonixCredentialEnv() {
  const env = {};
  try {
    const raw = readFileSync(join(homedir(), ".reasonix", "config.json"), "utf8");
    const cfg = JSON.parse(raw);
    if (!process.env.DEEPSEEK_API_KEY && typeof cfg.apiKey === "string" && cfg.apiKey) {
      env.DEEPSEEK_API_KEY = cfg.apiKey;
    }
    if (!process.env.DEEPSEEK_BASE_URL && !process.env.DEEPSEEK_API_BASE_URL && typeof cfg.baseUrl === "string" && cfg.baseUrl) {
      env.DEEPSEEK_BASE_URL = cfg.baseUrl;
    }
    if (!process.env.OLLAMA_API_KEY && typeof cfg.ollamaApiKey === "string" && cfg.ollamaApiKey) {
      env.OLLAMA_API_KEY = cfg.ollamaApiKey;
      env.ollamaApiKey = cfg.ollamaApiKey;
    }
  } catch {
    // Best-effort only. Reasonix will still read explicit env vars or local .env.
  }
  return env;
}
