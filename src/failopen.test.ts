import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { assessFile } from "./assess.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("fail-open returns review instead of throwing when Jev is unavailable", async () => {
  const prev = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "paste_your_key";
  try {
    const report = await assessFile({
      cwd: repo,
      file: "src/policy.ts",
      failOpen: true,
    });
    assert.equal(report.fail_open, true);
    assert.equal(report.skipped_jev, true);
    assert.equal(report.verdict.action, "review");
    assert.match(report.verdict.reasons[0] ?? "", /fail-open/);
  } finally {
    if (prev == null) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = prev;
  }
});

test("without fail-open a missing key still throws", async () => {
  const prev = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "paste_your_key";
  try {
    await assert.rejects(
      () => assessFile({ cwd: repo, file: "src/policy.ts", failOpen: false }),
      /placeholder|TYPESAFE_API_KEY/,
    );
  } finally {
    if (prev == null) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = prev;
  }
});
