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
  const marker = `\n\n[TRUNCATED: original review context was ${bytes} bytes; byte cap is ${byteCap}. Ask Codex for exact files or full diff hunks if needed.]\n`;
  const markerFits = Buffer.byteLength(marker, "utf8") <= byteCap;
  const fittedMarker = markerFits ? marker : Buffer.from("\n\n[TRUNCATED]\n").subarray(0, byteCap).toString("utf8");
  const sliceCap = Math.max(0, byteCap - Buffer.byteLength(fittedMarker, "utf8"));
  let content = `${Buffer.from(value).subarray(0, sliceCap).toString("utf8")}${fittedMarker}`;
  while (Buffer.byteLength(content, "utf8") > byteCap) {
    content = content.slice(0, -1);
  }
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

function collectCompactWorkingTreeContext(repoRoot) {
  const state = getWorkingTreeState(repoRoot);
  const status = git(repoRoot, ["status", "--short", "--untracked-files=all"]);
  const stagedStat = git(repoRoot, ["diff", "--cached", "--stat", "--no-ext-diff", "--submodule=short"]);
  const unstagedStat = git(repoRoot, ["diff", "--stat", "--no-ext-diff", "--submodule=short"]);
  const stagedNames = git(repoRoot, ["diff", "--cached", "--name-status"]);
  const unstagedNames = git(repoRoot, ["diff", "--name-status"]);
  const stagedDiff = git(repoRoot, ["diff", "--cached", "--unified=0", "--no-ext-diff", "--submodule=short"]);
  const unstagedDiff = git(repoRoot, ["diff", "--unified=0", "--no-ext-diff", "--submodule=short"]);
  const untracked = state.untracked.map((file) => `- ${file}`).join("\n");
  const changedFiles = uniqueSorted(state.staged, state.unstaged, state.untracked);
  return {
    summary: `Reviewing compact context for ${state.staged.length} staged, ${state.unstaged.length} unstaged, and ${state.untracked.length} untracked file(s).`,
    changedFiles,
    content: [
      section("Compact Context Notice", "This compact review context omits unchanged diff context and untracked file bodies. Ask Codex for exact files or full diff hunks if needed."),
      section("Git Status", status),
      section("Changed File Names", uniqueSorted(state.staged, state.unstaged, state.untracked).join("\n")),
      section("Staged Name Status", stagedNames),
      section("Unstaged Name Status", unstagedNames),
      section("Staged Diff Stat", stagedStat),
      section("Unstaged Diff Stat", unstagedStat),
      section("Staged Compact Diff (--unified=0)", stagedDiff),
      section("Unstaged Compact Diff (--unified=0)", unstagedDiff),
      section("Untracked File Names", untracked),
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

function collectCompactBranchContext(repoRoot, baseRef) {
  const mergeBase = git(repoRoot, ["merge-base", "HEAD", baseRef]).trim();
  const range = `${mergeBase}..HEAD`;
  const currentBranch = git(repoRoot, ["branch", "--show-current"]).trim() || "HEAD";
  const changedFiles = splitLines(git(repoRoot, ["diff", "--name-only", range]));
  const commitLog = git(repoRoot, ["log", "--oneline", "--decorate", range]);
  const diffStat = git(repoRoot, ["diff", "--stat", range]);
  const nameStatus = git(repoRoot, ["diff", "--name-status", range]);
  const diff = git(repoRoot, ["diff", "--unified=0", "--no-ext-diff", "--submodule=short", range]);
  return {
    summary: `Reviewing compact branch context for ${currentBranch} against ${baseRef} from merge-base ${mergeBase}.`,
    changedFiles,
    content: [
      section("Compact Context Notice", "This compact review context omits unchanged diff context. Ask Codex for exact files or full diff hunks if needed."),
      section("Commit Log", commitLog),
      section("Changed File Names", changedFiles.join("\n")),
      section("Name Status", nameStatus),
      section("Diff Stat", diffStat),
      section("Compact Branch Diff (--unified=0)", diff),
    ].join("\n"),
  };
}

function collectContextByStyle(repoRoot, target, style) {
  if (target.mode === "branch") {
    return style === "compact"
      ? collectCompactBranchContext(repoRoot, target.baseRef)
      : collectBranchContext(repoRoot, target.baseRef);
  }
  return style === "compact"
    ? collectCompactWorkingTreeContext(repoRoot)
    : collectWorkingTreeContext(repoRoot);
}

export function collectReviewContext(cwd, target, { byteCap = DEFAULT_REVIEW_CONTEXT_BYTE_CAP, style = "auto" } = {}) {
  const repoRoot = ensureGitRepository(cwd);
  const requestedStyle = style === "compact" ? "compact" : "full";
  let collected = collectContextByStyle(repoRoot, target, requestedStyle);
  const header = [
    "# crb review context",
    "",
    `Repository: ${repoRoot}`,
    `Target: ${target.label}`,
    `Summary: ${collected.summary}`,
    `Changed files: ${collected.changedFiles.length}`,
    `Context style: ${requestedStyle}`,
    "",
  ].join("\n");
  let body = `${header}${collected.content}`;
  let compacted = false;
  if (style === "auto" && Buffer.byteLength(body, "utf8") > byteCap) {
    collected = collectContextByStyle(repoRoot, target, "compact");
    compacted = true;
    body = [
      "# crb review context",
      "",
      `Repository: ${repoRoot}`,
      `Target: ${target.label}`,
      `Summary: ${collected.summary}`,
      `Changed files: ${collected.changedFiles.length}`,
      "Context style: compact (auto; full context exceeded byte cap)",
      "",
      collected.content,
    ].join("\n");
  }
  const truncated = truncateUtf8(body, byteCap);
  return {
    repoRoot,
    target,
    summary: collected.summary,
    changedFiles: collected.changedFiles,
    path: `[git] ${target.label}`,
    contextStyle: compacted ? "compact-auto" : requestedStyle,
    compacted,
    ...truncated,
  };
}
