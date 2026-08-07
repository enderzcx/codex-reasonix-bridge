import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mcpServer = join(root, "plugins", "codex-reasonix", "scripts", "mcp_server.mjs");
const pluginRoot = join(root, "plugins", "codex-reasonix");

function rpc(messages, timeoutMs = 15_000) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [mcpServer], {
      cwd: pluginRoot,
      stdio: ["pipe", "pipe", "pipe"],
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
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`mcp timeout\n${stderr}\n${stdout}`));
    }, timeoutMs);
    child.on("error", reject);
    child.on("close", () => {
      clearTimeout(timer);
      const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      resolvePromise({ lines, stderr });
    });
    for (const message of messages) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }
    child.stdin.end();
  });
}

test("mcp server lists reasonix tools and setup works", async () => {
  const { lines } = await rpc([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "reasonix_setup",
        arguments: { cwd: root },
      },
    },
  ]);

  const init = lines.find((line) => line.id === 1);
  assert.equal(init.result.serverInfo.name, "codex-reasonix");
  assert.match(init.result.instructions, /0731/);

  const list = lines.find((line) => line.id === 2);
  const names = list.result.tools.map((tool) => tool.name);
  for (const required of [
    "reasonix_setup",
    "reasonix_consult",
    "reasonix_review",
    "reasonix_delegate",
    "reasonix_status",
    "reasonix_result",
    "reasonix_cancel",
    "reasonix_models",
  ]) {
    assert.ok(names.includes(required), `missing ${required}`);
  }

  const setup = lines.find((line) => line.id === 3);
  assert.equal(setup.result.isError, false);
  assert.equal(setup.result.structuredContent.default_model, "deepseek-v4-flash:0731-cloud");
});

test("mcp dry-run review returns routing for flash formal", async () => {
  const { lines } = await rpc(
    [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "reasonix_review",
          arguments: {
            cwd: root,
            dry_run: true,
            mode: "final-review",
            task: "plugin dry-run",
          },
        },
      },
    ],
    30_000,
  );
  const review = lines.find((line) => line.id === 2);
  assert.equal(review.result.isError, false);
  const payload = review.result.structuredContent;
  assert.equal(payload.routing.selected_model, "ollama-cloud/deepseek-v4-flash:0731-cloud");
});
