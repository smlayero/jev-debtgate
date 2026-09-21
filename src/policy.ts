import type {
  Action,
  Answer,
  ChoiceAnswer,
  DiffMetrics,
  FileMetrics,
  NoulAnswer,
  ScoreAnswer,
  Thresholds,
  Verdict,
} from "./types.js";
import { noulConfidence, round } from "./util.js";

export const DEFAULT_THRESHOLDS: Thresholds = {
  auto: Number(process.env.DEBTGATE_AUTO ?? 0.85),
  review: Number(process.env.DEBTGATE_REVIEW ?? 0.5),
};

function noul(answers: Record<string, Answer>, key: string): NoulAnswer | undefined {
  const a = answers[key];
  return a?.type === "noul" ? a : undefined;
}

function choice(answers: Record<string, Answer>, key: string): ChoiceAnswer | undefined {
  const a = answers[key];
  return a?.type === "choice" ? a : undefined;
}

function score(answers: Record<string, Answer>, key: string): ScoreAnswer | undefined {
  const a = answers[key];
  return a?.type === "score" ? a : undefined;
}

function floorOf(answers: Record<string, Answer>, keys?: string[]): number {
  const pick = keys?.length ? keys : Object.keys(answers);
  const values: number[] = [];
  for (const key of pick) {
    const a = answers[key];
    if (!a) continue;
    if (a.type === "noul") values.push(noulConfidence(a.noul));
    else values.push(a.confidence);
  }
  return values.length ? Math.min(...values) : 1;
}

function tierOf(
  answers: Record<string, Answer>,
): Verdict["model_tier"] {
  const t = choice(answers, "model_tier")?.choice;
  if (t === "cheap" || t === "standard" || t === "reasoning") return t;
  return "unknown";
}

function push(reasons: string[], cond: boolean, msg: string): void {
  if (cond) reasons.push(msg);
}

export function decideDiff(
  answers: Record<string, Answer>,
  metrics: DiffMetrics,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): Verdict {
  const reasons: string[] = [];
  const direction = choice(answers, "direction");
  const kind = choice(answers, "debt_kind");
  const workaround = noul(answers, "is_workaround");
  const merge = noul(answers, "safe_to_auto_merge");
  const human = noul(answers, "needs_human");
  const severity = score(answers, "severity");
  const confFloor = floorOf(answers, ["direction", "is_workaround"]);

  const heuristicHit =
    metrics.timeout_bumps.length +
      metrics.skip_added.length +
      metrics.empty_catch.length +
      metrics.sql_concat.length >
    0;

  push(
    reasons,
    (workaround?.noul ?? 0) >= 0.7,
    `workaround probability ${round(workaround?.noul ?? 0)}`,
  );
  push(
    reasons,
    direction?.choice === "workaround" || direction?.choice === "add_debt",
    `direction=${direction?.choice} confidence=${round(direction?.confidence ?? 0)}`,
  );
  push(
    reasons,
    (kind?.choice === "security" && (kind.confidence ?? 0) >= 0.6) ||
      metrics.sql_concat.length > 0,
      "security-shaped debt in diff or SQL concatenation",
  );
  push(
    reasons,
    heuristicHit && (workaround?.noul ?? 0) >= 0.45,
    `static analysis: ${summarizeFindings(metrics)}`,
  );
  push(
    reasons,
    (human?.noul ?? 0) >= 0.7,
    `needs_human ${round(human?.noul ?? 0)}`,
  );

  let action: Action = "allow";
  const sev = severity?.score ?? 0;
  const work = workaround?.noul ?? 0;
  const mergeOk = merge?.noul ?? 0;

  if (metrics.sql_concat.length > 0 && work < 0.3 && (kind?.choice === "security" || metrics.sql_concat.length > 0)) {
    if ((kind?.choice === "security" && kind.confidence >= 0.7) || metrics.sql_concat.length > 0) {
      action = "block";
      reasons.push("possible unsafe query construction");
    }
  }

  if (work >= 0.75 || direction?.choice === "workaround") {
    action = "block";
  } else if (kind?.choice === "security" && (kind.confidence ?? 0) >= 0.75) {
    action = "block";
  } else if (confFloor < thresholds.review) {
    action = "review";
    reasons.push(`confidence floor ${round(confFloor)} below review threshold`);
  } else if (
    direction?.choice === "add_debt" &&
    (direction.confidence ?? 0) >= 0.7 &&
    sev >= 1.5
  ) {
    action = "review";
  } else if ((human?.noul ?? 0) >= 0.75) {
    action = "review";
  } else if (mergeOk >= thresholds.auto && sev < 1.2 && work < 0.35 && confFloor >= thresholds.auto) {
    action = "allow";
  } else if (direction?.choice === "pay_down" && (direction.confidence ?? 0) >= 0.7 && work < 0.4) {
    action = "allow";
  } else if (direction?.choice === "none" && work < 0.4 && confFloor >= thresholds.review) {
    action = "allow";
  } else {
    action = "review";
    if (!reasons.length) reasons.push("default to review when debt signal is mixed");
  }

  // Never auto-merge workarounds even if Jev is unsure on other axes.
  if (work >= 0.75) action = "block";

  let tier = tierOf(answers);
  if (action === "block" && (work >= 0.7 || direction?.choice === "workaround")) {
    tier = "reasoning";
  }

  return {
    action,
    reasons: reasons.length ? reasons : ["no blocking debt signal"],
    model_tier: tier,
    confidence_floor: round(confFloor),
  };
}

export function decideFile(
  answers: Record<string, Answer>,
  metrics: FileMetrics,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): Verdict {
  const reasons: string[] = [];
  const kind = choice(answers, "kind");
  const conc = noul(answers, "is_concentration_problem");
  const split = noul(answers, "split_now");
  const axis = choice(answers, "split_axis");
  const tests = noul(answers, "missing_tests");
  const dir = choice(answers, "pr_direction");
  const confFloor = floorOf(answers, ["kind", "is_concentration_problem"]);

  push(
    reasons,
    metrics.share_of_module >= 0.7 && metrics.loc >= 200,
    `file is ${round(metrics.share_of_module * 100, 1)}% of its directory (${metrics.loc} loc)`,
  );
  push(
    reasons,
    metrics.import_bucket_diversity >= 3,
    `import diversity ${metrics.import_bucket_diversity} buckets: ${JSON.stringify(metrics.import_buckets)}`,
  );
  push(reasons, metrics.looks_generated, "generated-file heuristic matched");
  push(
    reasons,
    (conc?.noul ?? 0) >= 0.7,
    `concentration ${round(conc?.noul ?? 0)} kind=${kind?.choice}`,
  );

  let action: Action = "allow";
  if (kind?.choice === "generated" || kind?.choice === "data_table") {
    action = "allow";
    reasons.push(`${kind.choice} - do not hand-split`);
  } else if ((tests?.noul ?? 0) >= 0.7 && (split?.noul ?? 0) >= 0.6) {
    action = "review";
    reasons.push("split wanted but tests look thin - lock behavior first");
  } else if (dir?.choice === "makes_worse" && (dir.confidence ?? 0) >= 0.7 && (conc?.noul ?? 0) >= 0.6) {
    action = "review";
    reasons.push("PR is concentrating more responsibility into a blob");
  } else if ((conc?.noul ?? 0) >= 0.8 && (split?.noul ?? 0) >= 0.75 && (axis?.confidence ?? 0) >= 0.6) {
    action = "review";
    reasons.push(`split along ${axis?.choice}`);
  } else if (confFloor < thresholds.review) {
    action = "review";
    reasons.push(`confidence floor ${round(confFloor)} - do not auto-split`);
  }

  return {
    action,
    reasons: reasons.length ? reasons : ["no concentration gate fired"],
    model_tier: (tests?.noul ?? 0) >= 0.7 ? "reasoning" : tierOf(answers),
    confidence_floor: round(confFloor),
  };
}

export function decideGate(
  answers: Record<string, Answer>,
  metrics: DiffMetrics,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): Verdict {
  const reasons: string[] = [];
  const work = noul(answers, "is_workaround")?.noul ?? 0;
  const hide = noul(answers, "hide_symptom")?.noul ?? 0;
  const fixed = noul(answers, "root_cause_fixed")?.noul ?? 0;
  const pay = noul(answers, "allow_as_debt_paydown")?.noul ?? 0;
  const kind = choice(answers, "kind");
  const confFloor = floorOf(answers, ["is_workaround", "hide_symptom", "kind"]);

  push(reasons, work >= 0.6, `is_workaround ${round(work)}`);
  push(reasons, hide >= 0.6, `hide_symptom ${round(hide)}`);
  push(reasons, fixed < 0.4, `root_cause_fixed ${round(fixed)}`);
  push(reasons, Boolean(kind?.choice && kind.choice !== "none"), `kind=${kind?.choice}`);
  push(
    reasons,
    metrics.timeout_bumps.length + metrics.skip_added.length + metrics.sleep_added.length > 0,
    summarizeFindings(metrics),
  );

  let action: Action = "allow";
  if (work >= 0.7 && hide >= 0.6 && fixed < 0.45) {
    action = "block";
    reasons.push("do not merge as a debt pay-down - this hides a symptom");
  } else if (pay >= 0.7 && work >= 0.6) {
    action = "block";
    reasons.push("refused debt-paydown label on a workaround");
  } else if (work >= 0.55 || hide >= 0.55) {
    action = "review";
  } else if (confFloor < thresholds.review) {
    action = "review";
    reasons.push(`confidence floor ${round(confFloor)}`);
  }

  return {
    action,
    reasons: reasons.length ? reasons : ["no workaround gate fired"],
    model_tier: hide >= 0.5 ? "reasoning" : tierOf(answers),
    confidence_floor: round(confFloor),
  };
}

function summarizeFindings(metrics: DiffMetrics): string {
  const parts = [
    metrics.timeout_bumps.length ? `timeout=${metrics.timeout_bumps.length}` : "",
    metrics.skip_added.length ? `skip=${metrics.skip_added.length}` : "",
    metrics.empty_catch.length ? `empty_catch=${metrics.empty_catch.length}` : "",
    metrics.sql_concat.length ? `sql_concat=${metrics.sql_concat.length}` : "",
    metrics.type_escape.length ? `type_escape=${metrics.type_escape.length}` : "",
    metrics.sleep_added.length ? `sleep=${metrics.sleep_added.length}` : "",
  ].filter(Boolean);
  return parts.join(", ") || "no static-analysis hits";
}

export function exitCode(action: Action): number {
  if (action === "allow") return 0;
  if (action === "review") return 1;
  return 2;
}
