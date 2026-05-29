#!/usr/bin/env node
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "skills", "codex-reasonix");
mkdirSync(dirname(dest), { recursive: true });
rmSync(dest, { recursive: true, force: true });
cpSync(join(repoRoot, "skills", "codex-reasonix"), dest, { recursive: true });
console.log(`installed skill: ${dest}`);
