import type { Question } from "./types.js";
import { PACK_ID } from "./util.js";

export const DIFF_QUESTIONS: Record<string, Question> = {
  direction: {
    type: "choice",
    instructions:
      "Does this diff pay down technical debt, add debt, hide a symptom as a workaround, mix both, or is it unrelated to debt?",
    criteria: {
      pay_down:
        "Removes workarounds, splits a god file, adds meaningful tests, or deletes dead complexity without hiding failures",
      add_debt:
        "Adds coupling, a new workaround, a larger god file, weaker types, or untested production paths",
      workaround:
        "Primarily hides a symptom (timeouts, skips, empty catch, retries, sleeps) rather than fixing the cause",
      mixed: "Pays down one area while adding debt in another",
      none: "Feature/bug work with no meaningful debt signal",
    },
  },
  debt_kind: {
    type: "choice",
    instructions: "If debt is present, what is the primary kind?",
    criteria: {
      test_gap: "Missing tests, tests that only sleep/skip, or coverage theater",
      type_escape: "any, ts-ignore, unchecked casts, disabled lint on types",
      security: "Injection, auth gaps, secret handling, unsafe query construction",
      god_file: "Too many responsibilities concentrated in one file",
      architecture: "Cross-boundary coupling, circular deps, layering violations",
      perf: "N+1, unbounded caches, accidental extra I/O in a hot path",
      api_debt: "Old API kept without deprecation, breaking contract quietly",
      ops: "Hardcoded config, missing timeouts/retries policy, poor observability",
      duplication: "Copy-paste logic instead of a shared unit",
      none: "No material debt kind",
    },
  },
  is_workaround: {
    type: "noul",
    instructions:
      "Is this change primarily a workaround that hides a failing symptom instead of fixing the root cause?",
    criteria: {
      true: "Timeout bump, skip, empty catch, sleep, or retry used to make tests/CI green",
      false: "Root cause addressed, or not a failure-hiding change",
    },
  },
  tests_thin: {
    type: "noul",
    instructions:
      "Are tests missing or too weak to lock behavior if this were refactored?",
  },
  severity: {
    type: "score",
    instructions: "How severe is the debt impact if this ships as-is?",
    criteria: [
      "Style-only or easily reversible",
      "Local maintainability hit",
      "Will slow future changes or flake CI",
      "User-visible failure, data, or security risk",
    ],
  },
  safe_to_auto_merge: {
    type: "noul",
    instructions:
      "Is this safe to auto-merge as a debt change without a human? Only yes for low-risk, reversible cleanups.",
  },
  model_tier: {
    type: "choice",
    instructions:
      "If an agent continues work, which model tier is enough for the next edit?",
    criteria: {
      cheap: "Rename, delete unused imports, one-file mechanical cleanup",
      standard: "Extract a function, add focused tests, straightforward API swap",
      reasoning:
        "Split a god file, fix root cause behind a flake, auth/data-model, or unclear architecture",
    },
  },
  needs_human: {
    type: "noul",
    instructions:
      "Should a human review before merge because scope, risk, or ambiguity is high?",
  },
};

export const FILE_QUESTIONS: Record<string, Question> = {
  is_concentration_problem: {
    type: "noul",
    instructions:
      "Are too many responsibilities concentrated in this one file, given the metrics (loc share, import diversity, function sizes)?",
    criteria: {
      true: "God file / blob module: mixed layers or domains in one place",
      false: "Large but cohesive, generated, a data table, or not actually concentrated",
    },
  },
  kind: {
    type: "choice",
    instructions: "What kind of large/concentrated file is this?",
    criteria: {
      god_file:
        "Multiple jobs: e.g. HTTP + SQL + rendering + notifications in one unit",
      generated: "Generated code, lockfile, protobuf, or vendor output — do not hand-split",
      data_table: "Routes, schema, constants, dictionaries — large but tabular",
      cohesive_module: "Large but one topic (parser, codec, math)",
      test_blob: "Tests piled together; different from a production god file",
      unclear: "Not enough signal",
    },
  },
  split_now: {
    type: "noul",
    instructions:
      "Should this file be split before more feature work lands in it?",
  },
  split_axis: {
    type: "choice",
    instructions:
      "If splitting, which axis is safest? If it should not be split, choose keep or test_first.",
    criteria: {
      by_feature: "Split by product feature / use case",
      by_layer: "Split handler vs domain vs repository / I/O",
      by_entity: "Split by entity or bounded context",
      extract_utils: "Only extract shared helpers; file can stay",
      test_first: "Tests are too thin; do not split until behavior is locked",
      keep: "Leave as-is (generated, table, cohesive, or low churn)",
    },
  },
  missing_tests: {
    type: "noul",
    instructions:
      "Would splitting this file be unsafe because tests do not lock current behavior?",
  },
  pr_direction: {
    type: "choice",
    instructions:
      "If a diff excerpt is present, is the latest change making concentration worse, extracting, neutral, or unrelated?",
    criteria: {
      makes_worse: "Adding more responsibilities or many lines to the blob",
      extracting: "Moving code out or cutting a responsibility",
      neutral: "Touching the file without changing concentration much",
      unrelated: "No useful diff context",
    },
  },
  model_tier: {
    type: "choice",
    instructions: "Which model tier should edit this file next?",
    criteria: {
      cheap: "Mechanical cleanup only",
      standard: "Extract helpers with tests present",
      reasoning: "Split boundaries, data flow, or production god file",
    },
  },
};

export const GATE_QUESTIONS: Record<string, Question> = {
  is_workaround: {
    type: "noul",
    instructions:
      "Is this diff primarily hiding a failure symptom rather than fixing the cause?",
  },
  hide_symptom: {
    type: "noul",
    instructions:
      "Does it hide flakes or errors via timeout, skip, empty catch, sleep, or blanket retry?",
  },
  root_cause_fixed: {
    type: "noul",
    instructions: "Is the underlying race, bug, or design issue actually fixed?",
  },
  kind: {
    type: "choice",
    instructions: "What kind of workaround, if any?",
    criteria: {
      timeout: "Increased test or request timeout to pass CI",
      skip: "Skipped or disabled a failing test",
      empty_catch: "Swallowed errors",
      type_escape: "Bypassed the type system to compile",
      retry_storm: "Retries/sleeps used to paper over a race",
      other: "Some other workaround",
      none: "Not a workaround",
    },
  },
  allow_as_debt_paydown: {
    type: "noul",
    instructions:
      "Should this be labeled as paying down technical debt? Almost never yes for a workaround.",
  },
  model_tier: {
    type: "choice",
    instructions: "If work continues, which model tier should hunt the real fix?",
    criteria: {
      cheap: "Not applicable; this is not a real fix path",
      standard: "Localized root-cause fix with tests",
      reasoning: "Concurrency, timing, or architectural flake",
    },
  },
};

export function packMeta(): { id: string; pack: typeof PACK_ID } {
  return { id: PACK_ID, pack: PACK_ID };
}
