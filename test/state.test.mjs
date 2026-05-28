import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJob, listJobs, resolveJobReference, updateJob } from "../src/state.mjs";

test("state stores, updates, and resolves jobs by id prefix", () => {
  const cwd = mkdtempSync(join(tmpdir(), "crb-state-"));
  createJob(cwd, {
    id: "review-abc123",
    kind: "delegate",
    title: "Reasonix final-review",
    status: "queued",
    summary: "queued job",
  });
  updateJob(cwd, "review-abc123", {
    status: "completed",
    summary: "done",
    result: { summary: "done" },
  });

  const jobs = listJobs(cwd);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].status, "completed");
  assert.equal(resolveJobReference(cwd, "review-abc")?.id, "review-abc123");
  assert.equal(resolveJobReference(cwd, "")?.summary, "done");
});
