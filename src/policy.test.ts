import assert from "node:assert/strict";
import test from "node:test";
import { decideDiff, decideFile, decideGate } from "./policy.js";
import type { Answer, DiffMetrics, FileMetrics } from "./types.js";

const metrics: DiffMetrics = {
  file_count: 1,
  added: 4,
  removed: 1,
  timeout_bumps: ["timeout: timeout: 5000"],
  skip_added: [],
  empty_catch: [],
  sql_concat: [],
  type_escape: [],
  sleep_added: [],
};

test("workaround gate blocks timeout-only fake fixes", () => {
  const answers: Record<string, Answer> = {
    is_workaround: { type: "noul", noul: 0.88 },
    hide_symptom: { type: "noul", noul: 0.9 },
    root_cause_fixed: { type: "noul", noul: 0.2 },
    kind: {
      type: "choice",
      choice: "timeout",
      confidence: 0.92,
      probabilities: { timeout: 0.92, none: 0.08 },
    },
    allow_as_debt_paydown: { type: "noul", noul: 0.1 },
    model_tier: {
      type: "choice",
      choice: "reasoning",
      confidence: 0.8,
      probabilities: { reasoning: 0.8, standard: 0.2, cheap: 0 },
    },
  };
  const v = decideGate(answers, metrics);
  assert.equal(v.action, "block");
  assert.equal(v.model_tier, "reasoning");
});

test("clean rename-like diff can allow", () => {
  const answers: Record<string, Answer> = {
    direction: {
      type: "choice",
      choice: "none",
      confidence: 0.95,
      probabilities: { none: 0.95, pay_down: 0.05 },
    },
    debt_kind: {
      type: "choice",
      choice: "none",
      confidence: 0.9,
      probabilities: { none: 0.9 },
    },
    is_workaround: { type: "noul", noul: 0.05 },
    tests_thin: { type: "noul", noul: 0.1 },
    severity: {
      type: "score",
      score: 0.1,
      confidence: 0.9,
      probabilities: { "0": 0.9, "1": 0.1 },
      legend: {},
    },
    safe_to_auto_merge: { type: "noul", noul: 0.9 },
    model_tier: {
      type: "choice",
      choice: "cheap",
      confidence: 1,
      probabilities: { cheap: 1 },
    },
    needs_human: { type: "noul", noul: 0.1 },
  };
  const empty: DiffMetrics = { ...metrics, timeout_bumps: [], added: 2 };
  const v = decideDiff(answers, empty);
  assert.equal(v.action, "allow");
  assert.equal(v.model_tier, "cheap");
});

test("workaround-shaped diff blocks and upgrades tier to reasoning", () => {
  const answers: Record<string, Answer> = {
    direction: {
      type: "choice",
      choice: "workaround",
      confidence: 0.99,
      probabilities: { workaround: 0.99 },
    },
    debt_kind: {
      type: "choice",
      choice: "ops",
      confidence: 0.4,
      probabilities: { ops: 0.47, none: 0.29 },
    },
    is_workaround: { type: "noul", noul: 0.8 },
    tests_thin: { type: "noul", noul: 0.43 },
    severity: {
      type: "score",
      score: 1.29,
      confidence: 0.28,
      probabilities: { "2": 0.52 },
      legend: {},
    },
    safe_to_auto_merge: { type: "noul", noul: 0.6 },
    model_tier: {
      type: "choice",
      choice: "cheap",
      confidence: 0.86,
      probabilities: { cheap: 0.91 },
    },
    needs_human: { type: "noul", noul: 0.2 },
  };
  const v = decideDiff(answers, metrics);
  assert.equal(v.action, "block");
  assert.equal(v.model_tier, "reasoning");
  assert.ok(v.confidence_floor >= 0.8);
});

test("sql concat heuristic plus security choice blocks", () => {
  const answers: Record<string, Answer> = {
    direction: {
      type: "choice",
      choice: "add_debt",
      confidence: 0.8,
      probabilities: { add_debt: 0.8 },
    },
    debt_kind: {
      type: "choice",
      choice: "security",
      confidence: 0.95,
      probabilities: { security: 0.95 },
    },
    is_workaround: { type: "noul", noul: 0.1 },
    tests_thin: { type: "noul", noul: 0.4 },
    severity: {
      type: "score",
      score: 3,
      confidence: 0.9,
      probabilities: { "3": 1 },
      legend: {},
    },
    safe_to_auto_merge: { type: "noul", noul: 0.02 },
    model_tier: {
      type: "choice",
      choice: "reasoning",
      confidence: 0.9,
      probabilities: { reasoning: 0.9 },
    },
    needs_human: { type: "noul", noul: 0.9 },
  };
  const v = decideDiff(answers, {
    ...metrics,
    timeout_bumps: [],
    sql_concat: ["sql_concat: db.execute(`SELECT ${q}`)"] ,
  });
  assert.equal(v.action, "block");
});

test("generated files are not split", () => {
  const file: FileMetrics = {
    path: "src/api.gen.ts",
    loc: 4000,
    module_dir: "src",
    module_file_count: 2,
    module_loc: 4100,
    share_of_module: 0.97,
    function_count: 80,
    class_count: 0,
    top_functions: [],
    import_buckets: { other: 2 },
    import_bucket_diversity: 0,
    looks_generated: true,
    churn_90d_commits: 1,
  };
  const answers: Record<string, Answer> = {
    is_concentration_problem: { type: "noul", noul: 0.2 },
    kind: {
      type: "choice",
      choice: "generated",
      confidence: 0.95,
      probabilities: { generated: 0.95 },
    },
    split_now: { type: "noul", noul: 0.05 },
    split_axis: {
      type: "choice",
      choice: "keep",
      confidence: 0.9,
      probabilities: { keep: 0.9 },
    },
    missing_tests: { type: "noul", noul: 0.2 },
    pr_direction: {
      type: "choice",
      choice: "unrelated",
      confidence: 0.7,
      probabilities: { unrelated: 0.7 },
    },
    model_tier: {
      type: "choice",
      choice: "cheap",
      confidence: 0.8,
      probabilities: { cheap: 0.8 },
    },
  };
  const v = decideFile(answers, file);
  assert.equal(v.action, "allow");
  assert.match(v.reasons.join(" "), /generated/);
});

test("low-confidence split stays review, not auto", () => {
  const file: FileMetrics = {
    path: "src/app.ts",
    loc: 900,
    module_dir: "src",
    module_file_count: 1,
    module_loc: 900,
    share_of_module: 1,
    function_count: 20,
    class_count: 2,
    top_functions: [{ name: "handle", approx_lines: 400 }],
    import_buckets: { http: 2, db: 2, ui: 1 },
    import_bucket_diversity: 3,
    looks_generated: false,
    churn_90d_commits: 12,
  };
  const answers: Record<string, Answer> = {
    is_concentration_problem: { type: "noul", noul: 0.55 },
    kind: {
      type: "choice",
      choice: "god_file",
      confidence: 0.4,
      probabilities: { god_file: 0.44, cohesive_module: 0.31 },
    },
    split_now: { type: "noul", noul: 0.52 },
    split_axis: {
      type: "choice",
      choice: "by_layer",
      confidence: 0.41,
      probabilities: { by_layer: 0.41, by_feature: 0.3 },
    },
    missing_tests: { type: "noul", noul: 0.48 },
    pr_direction: {
      type: "choice",
      choice: "makes_worse",
      confidence: 0.4,
      probabilities: { makes_worse: 0.4 },
    },
    model_tier: {
      type: "choice",
      choice: "reasoning",
      confidence: 0.5,
      probabilities: { reasoning: 0.5 },
    },
  };
  const v = decideFile(answers, file);
  assert.equal(v.action, "review");
});
