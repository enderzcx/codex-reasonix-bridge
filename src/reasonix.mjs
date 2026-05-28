import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const APP_NODE = "/Applications/Reasonix.app/Contents/Resources/node";
const APP_CLI = "/Applications/Reasonix.app/Contents/Resources/dist/cli/index.js";
export const DEFAULT_TIMEOUT_MS = 180_000;

export async function runDelegateModel({ reasonixBin, model, effort, system, prompt, noProxy = false, timeoutMs }) {
  return runReasonix({ reasonixBin, model, effort, system, prompt, noProxy, timeoutMs });
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

export async function runReasonix({ reasonixBin, model, effort, system, prompt, noProxy = false, timeoutMs = resolveTimeoutMs() }) {
  const command = resolveReasonixCommand(reasonixBin);
  const args = [...command.slice(1), "run", "-m", model];
  if (effort) args.push("--effort", effort);
  if (system) args.push("--system", system);
  if (noProxy) args.push("--no-proxy");
  args.push(prompt);

  const child = spawn(command[0], args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
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
