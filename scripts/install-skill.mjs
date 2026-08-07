#!/usr/bin/env node
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillSource = join(repoRoot, "plugins", "codex-reasonix", "skills", "codex-reasonix");
const dest = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "skills", "codex-reasonix");
mkdirSync(dirname(dest), { recursive: true });
rmSync(dest, { recursive: true, force: true });
cpSync(skillSource, dest, { recursive: true });
console.log(`installed skill: ${dest}`);
console.log("Tip: install the full plugin for MCP tools:");
console.log(`  codex plugin marketplace add "${repoRoot}"`);
console.log("  codex plugin add codex-reasonix@codex-reasonix-bridge");
console.log(`  grok plugin marketplace add "${repoRoot}"`);
console.log("  grok plugin install codex-reasonix --trust");
