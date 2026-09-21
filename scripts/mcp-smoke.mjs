import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["dist/mcp.js"], {
  cwd: process.cwd(),
  stdio: ["pipe", "pipe", "pipe"],
  env: process.env,
});

let buf = "";
const pending = new Map();
let nextId = 1;

child.stderr.on("data", (d) => process.stderr.write(d));
child.stdout.on("data", (d) => {
  buf += d.toString("utf8");
  let idx;
  while ((idx = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, idx).replace(/\r$/, "");
    buf = buf.slice(idx + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id != null && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

function rpc(method, params) {
  const id = nextId++;
  const msg = { jsonrpc: "2.0", id, method, params };
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${method}`)), 8000);
    pending.set(id, (m) => {
      clearTimeout(t);
      resolve(m);
    });
    child.stdin.write(JSON.stringify(msg) + "\n");
  });
}

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

const init = await rpc("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "debtgate-e2e", version: "0.0.1" },
});
notify("notifications/initialized");
const tools = await rpc("tools/list", {});
const call = await rpc("tools/call", {
  name: "debt_assess_file",
  arguments: {
    file: "examples/god-file/src/kitchen-sink.ts",
    collect_only: true,
  },
});
const payload = JSON.parse(call.result?.content?.[0]?.text ?? "{}");
console.log(
  JSON.stringify(
    {
      protocol: init.result?.protocolVersion,
      server: init.result?.serverInfo,
      tools: (tools.result?.tools ?? []).map((t) => t.name),
      tool_call: {
        isError: call.result?.isError ?? false,
        action: payload.verdict?.action,
        pack: payload.pack,
        skipped_jev: payload.skipped_jev,
      },
    },
    null,
    2,
  ),
);
child.kill();
