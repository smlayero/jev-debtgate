import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig, mergeRunOptions } from "./config.js";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "debtgate-config-"));
}

test("missing .debtgate.json returns empty config", () => {
  const dir = tmpDir();
  assert.deepEqual(loadConfig(dir), {});
});

test("invalid JSON is rejected", () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, ".debtgate.json"), "{nope");
  assert.throws(() => loadConfig(dir), /Invalid \.debtgate.json/);
});

test("mergeRunOptions prefers flags over file over env", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, ".debtgate.json"),
    JSON.stringify({
      base: "HEAD",
      shadow: true,
      failOpen: true,
      thresholds: { auto: 0.9, review: 0.4 },
    }),
  );
  const merged = mergeRunOptions(dir, { base: "origin/main", collectOnly: true });
  assert.equal(merged.base, "origin/main");
  assert.equal(merged.shadow, true);
  assert.equal(merged.failOpen, true);
  assert.equal(merged.collectOnly, true);
  assert.equal(merged.thresholds.auto, 0.9);
  assert.equal(merged.thresholds.review, 0.4);
});

test("CLI flags can enable shadow without a config file", () => {
  const dir = tmpDir();
  const prevShadow = process.env.DEBTGATE_SHADOW;
  const prevFail = process.env.DEBTGATE_FAIL_OPEN;
  delete process.env.DEBTGATE_SHADOW;
  delete process.env.DEBTGATE_FAIL_OPEN;
  try {
    const merged = mergeRunOptions(dir, { shadow: true });
    assert.equal(merged.shadow, true);
    assert.equal(merged.failOpen, false);
  } finally {
    if (prevShadow == null) delete process.env.DEBTGATE_SHADOW;
    else process.env.DEBTGATE_SHADOW = prevShadow;
    if (prevFail == null) delete process.env.DEBTGATE_FAIL_OPEN;
    else process.env.DEBTGATE_FAIL_OPEN = prevFail;
  }
});
