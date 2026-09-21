import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { collectFile } from "./collect/git.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("kitchen-sink example has diverse import buckets", () => {
  const { metrics } = collectFile({
    cwd: repoRoot,
    file: "examples/god-file/src/kitchen-sink.ts",
  });
  assert.ok(metrics.loc > 40);
  assert.ok(metrics.import_buckets.http >= 1);
  assert.ok(metrics.import_buckets.db >= 1);
  assert.ok(metrics.import_bucket_diversity >= 3);
  assert.equal(metrics.looks_generated, false);
});
