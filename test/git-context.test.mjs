import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collectReviewContext, resolveReviewTarget } from "../src/git-context.mjs";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function configureGitIdentity(cwd) {
  git(cwd, ["config", "user.email", "crb-test@example.com"]);
  git(cwd, ["config", "user.name", "CRB Test"]);
}

test("collects working tree review context for crb review", () => {
  const cwd = mkdtempSync(join(tmpdir(), "crb-git-"));
  git(cwd, ["init"]);
  writeFileSync(join(cwd, "note.txt"), "hello\n");

  const target = resolveReviewTarget(cwd, { scope: "working-tree" });
  const context = collectReviewContext(cwd, target);

  assert.equal(target.mode, "working-tree");
  assert.match(context.content, /Git Status/);
  assert.match(context.content, /\?\? note\.txt/);
  assert.match(context.content, /hello/);
  assert.equal(context.contextStyle, "full");
  assert.equal(context.truncated, false);
});

test("auto compacts oversized git review context before truncating", () => {
  const cwd = mkdtempSync(join(tmpdir(), "crb-git-"));
  git(cwd, ["init"]);
  writeFileSync(join(cwd, "large.txt"), `${"x".repeat(4096)}\n`);

  const target = resolveReviewTarget(cwd, { scope: "working-tree" });
  const context = collectReviewContext(cwd, target, { byteCap: 512 });

  assert.equal(context.contextStyle, "compact-auto");
  assert.equal(context.compacted, true);
  assert.equal(context.truncated, true);
  assert.ok(context.bytes > 512);
  assert.ok(Buffer.byteLength(context.content, "utf8") <= 512);
  assert.match(context.content, /Context style: compact/);
  assert.match(context.content, /\[TRUNCATED:/);
});

test("truncation marker still respects tiny byte caps", () => {
  const cwd = mkdtempSync(join(tmpdir(), "crb-git-tiny-cap-"));
  git(cwd, ["init"]);
  writeFileSync(join(cwd, "large.txt"), `${"x".repeat(4096)}\n`);

  const target = resolveReviewTarget(cwd, { scope: "working-tree" });
  const context = collectReviewContext(cwd, target, { byteCap: 16 });

  assert.equal(context.truncated, true);
  assert.ok(Buffer.byteLength(context.content, "utf8") <= 16);
});

test("collects explicit compact working tree review context", () => {
  const cwd = mkdtempSync(join(tmpdir(), "crb-git-compact-"));
  git(cwd, ["init"]);
  writeFileSync(join(cwd, "tracked.txt"), "before\n");
  git(cwd, ["add", "tracked.txt"]);
  writeFileSync(join(cwd, "tracked.txt"), "after\n");

  const target = resolveReviewTarget(cwd, { scope: "working-tree" });
  const context = collectReviewContext(cwd, target, { style: "compact" });

  assert.equal(context.contextStyle, "compact");
  assert.equal(context.compacted, false);
  assert.match(context.content, /Compact Context Notice/);
  assert.match(context.content, /Unstaged Compact Diff/);
  assert.match(context.content, /after/);
});

test("collects explicit compact branch review context", () => {
  const cwd = mkdtempSync(join(tmpdir(), "crb-git-branch-compact-"));
  git(cwd, ["init"]);
  configureGitIdentity(cwd);
  writeFileSync(join(cwd, "tracked.txt"), "before\n");
  git(cwd, ["add", "tracked.txt"]);
  git(cwd, ["commit", "-m", "initial"]);
  const base = git(cwd, ["branch", "--show-current"]).trim();
  git(cwd, ["checkout", "-q", "-b", "feature"]);
  writeFileSync(join(cwd, "tracked.txt"), "after\n");
  git(cwd, ["add", "tracked.txt"]);
  git(cwd, ["commit", "-m", "change"]);

  const target = resolveReviewTarget(cwd, { scope: "branch", base });
  const context = collectReviewContext(cwd, target, { style: "compact" });

  assert.equal(context.contextStyle, "compact");
  assert.equal(context.compacted, false);
  assert.match(context.content, /Compact Branch Diff/);
  assert.match(context.content, /Commit Log/);
  assert.match(context.content, /after/);
});

test("auto compacts oversized branch review context", () => {
  const cwd = mkdtempSync(join(tmpdir(), "crb-git-branch-auto-"));
  git(cwd, ["init"]);
  configureGitIdentity(cwd);
  writeFileSync(join(cwd, "tracked.txt"), "before\n");
  git(cwd, ["add", "tracked.txt"]);
  git(cwd, ["commit", "-m", "initial"]);
  const base = git(cwd, ["branch", "--show-current"]).trim();
  git(cwd, ["checkout", "-q", "-b", "feature"]);
  writeFileSync(join(cwd, "tracked.txt"), `${"after\n".repeat(512)}`);
  git(cwd, ["add", "tracked.txt"]);
  git(cwd, ["commit", "-m", "large change"]);

  const target = resolveReviewTarget(cwd, { scope: "branch", base });
  const context = collectReviewContext(cwd, target, { byteCap: 768 });

  assert.equal(context.contextStyle, "compact-auto");
  assert.equal(context.compacted, true);
  assert.equal(context.truncated, true);
  assert.match(context.content, /Context style: compact/);
  assert.match(context.content, /\[TRUNCATED:/);
});
