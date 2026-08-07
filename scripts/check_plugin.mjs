#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const plugin = join(root, "plugins", "codex-reasonix");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const codex = loadJson(join(plugin, ".codex-plugin", "plugin.json"));
const portable = loadJson(join(plugin, "plugin.json"));
const mcp = loadJson(join(plugin, "mcp.json"));
const codexMcp = loadJson(join(plugin, ".mcp.json"));
const marketplace = loadJson(join(root, ".agents", "plugins", "marketplace.json"));
const skill = readFileSync(join(plugin, "skills", "codex-reasonix", "SKILL.md"), "utf8");

if (codex.name !== "codex-reasonix") fail("Codex plugin name mismatch");
if (portable.name !== "codex-reasonix") fail("Agent Plugins name mismatch");
if (portable.version !== codex.version) fail("plugin version drift");
if (portable.$schema !== "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json") {
  fail("missing Agent Plugins plugin $schema");
}
if (mcp.$schema !== "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json") {
  fail("missing Agent Plugins mcp $schema");
}
if (mcp.mcpServers?.["codex-reasonix"]?.command !== "node") fail("portable MCP command");
if (codexMcp.mcpServers?.["codex-reasonix"]?.command !== "node") fail("Codex MCP command");
if (
  JSON.stringify(mcp.mcpServers["codex-reasonix"].args) !==
  JSON.stringify(codexMcp.mcpServers["codex-reasonix"].args)
) {
  fail("MCP args drift");
}
if (marketplace.name === codex.name) fail("marketplace and plugin names must differ");
if (!skill.includes("reasonix_review") || !skill.includes("0731")) {
  fail("skill missing MCP tools or Flash formal tag");
}
for (const rel of [
  "scripts/mcp_server.mjs",
  "skills/codex-reasonix/SKILL.md",
  ".codex-plugin/plugin.json",
  "plugin.json",
  "mcp.json",
  ".mcp.json",
]) {
  if (!existsSync(join(plugin, rel))) fail(`missing ${rel}`);
}

const smoke = spawnSync(
  process.execPath,
  [join(plugin, "scripts", "mcp_server.mjs")],
  {
    cwd: plugin,
    input: `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "check", version: "0" } },
    })}\n${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`,
    encoding: "utf8",
    timeout: 10_000,
  },
);
if (smoke.status !== 0 && smoke.status !== null) {
  fail(`mcp server smoke failed: ${smoke.stderr || smoke.stdout}`);
}
const lines = smoke.stdout.split(/\r?\n/).filter(Boolean);
const toolsLine = lines.find((line) => line.includes("reasonix_review"));
if (!toolsLine) fail("mcp tools/list did not expose reasonix_review");

if (marketplace.name !== "codex-reasonix-bridge") {
  fail(`unexpected marketplace name: ${marketplace.name}`);
}
console.log(`plugin check: ok (${codex.version}, marketplace ${marketplace.name})`);
