import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { initProject } from "./init.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("init writes MCP example, skill, config, and CI workflow once", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "debtgate-init-"));
  const first = initProject({ cwd, root });
  assert.ok(first.some((line) => line.startsWith("write")));
  assert.equal(
    fs.existsSync(path.join(cwd, ".cursor", "skills", "debtgate", "SKILL.md")),
    true,
  );
  assert.equal(fs.existsSync(path.join(cwd, ".cursor", "mcp.json.example")), true);
  assert.equal(fs.existsSync(path.join(cwd, ".debtgate.json")), true);
  assert.equal(
    fs.existsSync(path.join(cwd, ".github", "workflows", "jev-debtgate.yml")),
    true,
  );
  const mcp = fs.readFileSync(path.join(cwd, ".cursor", "mcp.json.example"), "utf8");
  assert.match(mcp, /jev-debtgate/);
  const second = initProject({ cwd, root });
  assert.ok(second.some((line) => line.includes("skip") && line.includes("exists")));
});
