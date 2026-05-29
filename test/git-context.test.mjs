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
  assert.equal(context.truncated, false);
});

test("truncates oversized git review context with metadata", () => {
  const cwd = mkdtempSync(join(tmpdir(), "crb-git-"));
  git(cwd, ["init"]);
  writeFileSync(join(cwd, "large.txt"), `${"x".repeat(4096)}\n`);

  const target = resolveReviewTarget(cwd, { scope: "working-tree" });
  const context = collectReviewContext(cwd, target, { byteCap: 512 });

  assert.equal(context.truncated, true);
  assert.ok(context.bytes > 512);
  assert.ok(Buffer.byteLength(context.content, "utf8") <= 512);
});
