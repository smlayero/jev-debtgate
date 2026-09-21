/**
 * Live Jev e2e. Requires TYPESAFE_API_KEY in the environment.
 * Never prints the key. Creates throwaway git repos under os.tmpdir().
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");

if (!process.env.TYPESAFE_API_KEY?.trim()) {
  console.error("Set TYPESAFE_API_KEY to your own key before live-e2e.");
  process.exit(3);
}

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runDebtgate(args, cwd) {
  try {
    const stdout = execFileSync(process.execPath, [cli, ...args, "--json"], {
      cwd,
      encoding: "utf8",
      env: process.env,
    });
    return { code: 0, report: JSON.parse(stdout) };
  } catch (err) {
    const e = err;
    const stdout = e.stdout?.toString?.() ?? "";
    let report = null;
    try {
      report = JSON.parse(stdout);
    } catch {
      report = { raw: stdout || e.message };
    }
    return { code: e.status ?? 3, report };
  }
}

function tmpRepo(name, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `debtgate-${name}-`));
  sh("git", ["init"], dir);
  sh("git", ["config", "user.email", "e2e@debtgate.dev"], dir);
  sh("git", ["config", "user.name", "Debtgate E2E"], dir);
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, "utf8");
  }
  sh("git", ["add", "."], dir);
  sh("git", ["commit", "-qm", "seed"], dir);
  return dir;
}

const cases = [];

{
  const r = runDebtgate(
    ["file", "examples/god-file/src/kitchen-sink.ts"],
    root,
  );
  cases.push({
    name: "god-file",
    code: r.code,
    action: r.report.verdict?.action,
    kind: r.report.answers?.kind?.choice,
    expect: "review|block and god_file",
    ok:
      (r.report.answers?.kind?.choice === "god_file" ||
        r.report.answers?.is_concentration_problem?.noul >= 0.7) &&
      r.report.verdict?.action !== "allow",
  });
}

{
  const dir = tmpRepo("timeout", {
    "src/checkout.ts": "export function charge() { return Promise.resolve(); }\n",
    "src/checkout.test.ts":
      'import { charge } from "./checkout.js";\ntest("c", async () => { await charge(); }, 1000);\n',
  });
  fs.writeFileSync(
    path.join(dir, "src/checkout.test.ts"),
    'import { charge } from "./checkout.js";\ntest("c", async () => { await charge(); }, 5000);\n',
  );
  const r = runDebtgate(["gate"], dir);
  cases.push({
    name: "timeout-workaround",
    code: r.code,
    action: r.report.verdict?.action,
    kind: r.report.answers?.kind?.choice,
    expect: "block timeout",
    ok: r.report.verdict?.action === "block" && r.report.answers?.kind?.choice === "timeout",
  });
}

{
  const dir = tmpRepo("rename", {
    "README.md": "# Foo\nThe project is called Foo.\n",
  });
  fs.writeFileSync(path.join(dir, "README.md"), "# Bar\nThe project is called Bar.\n");
  const r = runDebtgate(["diff"], dir);
  cases.push({
    name: "clean-rename",
    code: r.code,
    action: r.report.verdict?.action,
    direction: r.report.answers?.direction?.choice,
    expect: "allow (not block)",
    ok: r.report.verdict?.action !== "block",
  });
}

{
  const dir = tmpRepo("sql", {
    "src/search.ts": "export function search(q) { return q; }\n",
  });
  fs.writeFileSync(
    path.join(dir, "src/search.ts"),
    'export function search(q) {\n  return db.execute("SELECT * FROM users WHERE name LIKE \'%" + q + "%\'");\n}\n',
  );
  const r = runDebtgate(["diff"], dir);
  cases.push({
    name: "sql-concat",
    code: r.code,
    action: r.report.verdict?.action,
    kind: r.report.answers?.debt_kind?.choice,
    expect: "block or review security",
    ok:
      r.report.verdict?.action === "block" ||
      r.report.answers?.debt_kind?.choice === "security",
  });
}

{
  const gen = path.join(root, "examples", "generated", "api.gen.ts");
  const r = runDebtgate(["file", path.relative(root, gen)], root);
  cases.push({
    name: "generated-file",
    code: r.code,
    action: r.report.verdict?.action,
    kind: r.report.answers?.kind?.choice,
    expect: "generated + allow",
    ok:
      r.report.answers?.kind?.choice === "generated" &&
      r.report.verdict?.action === "allow",
  });
}

const failed = cases.filter((c) => !c.ok);
console.log(JSON.stringify({ model: "jev-live", cases }, null, 2));
if (failed.length) {
  console.error(`live-e2e: ${failed.length}/${cases.length} failed`);
  process.exit(1);
}
console.error(`live-e2e: ${cases.length}/${cases.length} passed`);
