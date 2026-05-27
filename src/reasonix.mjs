import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const APP_NODE = "/Applications/Reasonix.app/Contents/Resources/node";
const APP_CLI = "/Applications/Reasonix.app/Contents/Resources/dist/cli/index.js";

export function resolveReasonixCommand(reasonixBin = process.env.REASONIX_BIN) {
  if (reasonixBin) return [reasonixBin];

  const found = spawnSync("which", ["reasonix"], { encoding: "utf8" });
  if (found.status === 0 && found.stdout.trim()) return [found.stdout.trim()];

  if (existsSync(APP_NODE) && existsSync(APP_CLI)) return [APP_NODE, APP_CLI];
  throw new Error("Reasonix CLI not found. Install Reasonix.app or set REASONIX_BIN.");
}

export async function runReasonix({ reasonixBin, model, effort, system, prompt, noProxy = false }) {
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

  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  if (code !== 0) {
    const detail = stderr.trim() || stdout.trim() || `exit code ${code}`;
    throw new Error(`Reasonix run failed: ${detail}`);
  }
  return { stdout, stderr };
}
