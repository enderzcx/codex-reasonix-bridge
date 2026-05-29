import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MAX_UNTRACKED_BYTES = 24 * 1024;
export const DEFAULT_REVIEW_CONTEXT_BYTE_CAP = 192 * 1024;

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function section(title, body) {
  return [`## ${title}`, "", String(body ?? "").trim() || "(none)", ""].join("\n");
}

function uniqueSorted(...groups) {
  return [...new Set(groups.flat().filter(Boolean))].sort();
}

function splitLines(value) {
  return String(value ?? "").trim().split("\n").map((line) => line.trim()).filter(Boolean);
}

function truncateUtf8(value, byteCap) {
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes <= byteCap) return { content: value, bytes, truncated: false };
  const content = Buffer.from(value).subarray(0, byteCap).toString("utf8");
  return { content, bytes, truncated: true };
}

function isProbablyText(buffer) {
  if (buffer.includes(0)) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious += 1;
  }
  return suspicious / Math.max(sample.length, 1) < 0.1;
}

function formatUntrackedFile(cwd, relativePath) {
  const absolutePath = join(cwd, relativePath);
  let stat;
  try {
    stat = statSync(absolutePath);
  } catch {
    return `### ${relativePath}\n(skipped: broken symlink or unreadable file)`;
  }
  if (stat.isDirectory()) return `### ${relativePath}\n(skipped: directory)`;
  if (stat.size > MAX_UNTRACKED_BYTES) {
    return `### ${relativePath}\n(skipped: ${stat.size} bytes exceeds ${MAX_UNTRACKED_BYTES} byte limit)`;
  }
  let buffer;
  try {
    buffer = readFileSync(absolutePath);
  } catch {
    return `### ${relativePath}\n(skipped: unreadable file)`;
  }
  if (!isProbablyText(buffer)) return `### ${relativePath}\n(skipped: binary file)`;
  return [`### ${relativePath}`, "```", buffer.toString("utf8").trimEnd(), "```"].join("\n");
}

export function ensureGitRepository(cwd) {
  try {
    return git(cwd, ["rev-parse", "--show-toplevel"]).trim();
  } catch {
    throw new Error("This command must run inside a Git repository.");
  }
}

export function getWorkingTreeState(cwd) {
  return {
    staged: splitLines(git(cwd, ["diff", "--cached", "--name-only"])),
    unstaged: splitLines(git(cwd, ["diff", "--name-only"])),
    untracked: splitLines(git(cwd, ["ls-files", "--others", "--exclude-standard"])),
  };
}

export function detectDefaultBranch(cwd) {
  try {
    const remoteHead = git(cwd, ["symbolic-ref", "refs/remotes/origin/HEAD"]).trim();
    if (remoteHead.startsWith("refs/remotes/origin/")) {
      return remoteHead.replace("refs/remotes/origin/", "");
    }
  } catch {
    // Fall through to common local branch names.
  }
  for (const candidate of ["main", "master", "trunk"]) {
    try {
      git(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${candidate}`]);
      return candidate;
    } catch {
      try {
        git(cwd, ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${candidate}`]);
        return `origin/${candidate}`;
      } catch {
        // Keep trying.
      }
    }
  }
  throw new Error("Unable to detect the default branch. Pass --base <ref> or use --scope working-tree.");
}

export function resolveReviewTarget(cwd, { base = null, scope = "auto" } = {}) {
  const repoRoot = ensureGitRepository(cwd);
  const supported = new Set(["auto", "working-tree", "branch"]);
  if (!supported.has(scope)) throw new Error(`unsupported review scope: ${scope}`);
  if (base) return { mode: "branch", label: `branch diff against ${base}`, baseRef: base, explicit: true };
  if (scope === "working-tree") return { mode: "working-tree", label: "working tree diff", explicit: true };
  if (scope === "branch") {
    const baseRef = detectDefaultBranch(repoRoot);
    return { mode: "branch", label: `branch diff against ${baseRef}`, baseRef, explicit: true };
  }
  const state = getWorkingTreeState(repoRoot);
  if (state.staged.length || state.unstaged.length || state.untracked.length) {
    return { mode: "working-tree", label: "working tree diff", explicit: false };
  }
  const baseRef = detectDefaultBranch(repoRoot);
  return { mode: "branch", label: `branch diff against ${baseRef}`, baseRef, explicit: false };
}

function collectWorkingTreeContext(repoRoot) {
  const state = getWorkingTreeState(repoRoot);
  const status = git(repoRoot, ["status", "--short", "--untracked-files=all"]);
  const stagedDiff = git(repoRoot, ["diff", "--cached", "--binary", "--no-ext-diff", "--submodule=diff"]);
  const unstagedDiff = git(repoRoot, ["diff", "--binary", "--no-ext-diff", "--submodule=diff"]);
  const untracked = state.untracked.map((file) => formatUntrackedFile(repoRoot, file)).join("\n\n");
  const changedFiles = uniqueSorted(state.staged, state.unstaged, state.untracked);
  return {
    summary: `Reviewing ${state.staged.length} staged, ${state.unstaged.length} unstaged, and ${state.untracked.length} untracked file(s).`,
    changedFiles,
    content: [
      section("Git Status", status),
      section("Staged Diff", stagedDiff),
      section("Unstaged Diff", unstagedDiff),
      section("Untracked Files", untracked),
    ].join("\n"),
  };
}

function collectBranchContext(repoRoot, baseRef) {
  const mergeBase = git(repoRoot, ["merge-base", "HEAD", baseRef]).trim();
  const range = `${mergeBase}..HEAD`;
  const currentBranch = git(repoRoot, ["branch", "--show-current"]).trim() || "HEAD";
  const changedFiles = splitLines(git(repoRoot, ["diff", "--name-only", range]));
  const commitLog = git(repoRoot, ["log", "--oneline", "--decorate", range]);
  const diffStat = git(repoRoot, ["diff", "--stat", range]);
  const diff = git(repoRoot, ["diff", "--binary", "--no-ext-diff", "--submodule=diff", range]);
  return {
    summary: `Reviewing branch ${currentBranch} against ${baseRef} from merge-base ${mergeBase}.`,
    changedFiles,
    content: [
      section("Commit Log", commitLog),
      section("Diff Stat", diffStat),
      section("Branch Diff", diff),
    ].join("\n"),
  };
}

export function collectReviewContext(cwd, target, { byteCap = DEFAULT_REVIEW_CONTEXT_BYTE_CAP } = {}) {
  const repoRoot = ensureGitRepository(cwd);
  const collected = target.mode === "branch"
    ? collectBranchContext(repoRoot, target.baseRef)
    : collectWorkingTreeContext(repoRoot);
  const header = [
    "# crb review context",
    "",
    `Repository: ${repoRoot}`,
    `Target: ${target.label}`,
    `Summary: ${collected.summary}`,
    `Changed files: ${collected.changedFiles.length}`,
    "",
  ].join("\n");
  const body = `${header}${collected.content}`;
  const truncated = truncateUtf8(body, byteCap);
  return {
    repoRoot,
    target,
    summary: collected.summary,
    changedFiles: collected.changedFiles,
    path: `[git] ${target.label}`,
    ...truncated,
  };
}
