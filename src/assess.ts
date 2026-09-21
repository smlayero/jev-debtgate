import { collectDiff, collectFile } from "./collect/git.js";
import { systemOne } from "./jev.js";
import { DIFF_QUESTIONS, FILE_QUESTIONS, GATE_QUESTIONS } from "./packs.js";
import { decideDiff, decideFile, decideGate } from "./policy.js";
import type { Report, Thresholds } from "./types.js";
import { DEFAULT_CONFIG } from "./config.js";
import { PACK_ID } from "./util.js";

type AssessOpts = {
  cwd: string;
  base?: string;
  collectOnly?: boolean;
  model?: string;
  failOpen?: boolean;
  thresholds?: Thresholds;
};

function unavailable(
  tool: Report["tool"],
  err: unknown,
  failOpen: boolean,
  metrics: Report["metrics"] = {},
): Report {
  const message = err instanceof Error ? err.message : String(err);
  if (!failOpen) throw err instanceof Error ? err : new Error(message);
  return {
    pack: PACK_ID,
    tool,
    skipped_jev: true,
    fail_open: true,
    metrics,
    verdict: {
      action: "review",
      reasons: [`Jev unavailable (fail-open): ${message}`],
      model_tier: "unknown",
      confidence_floor: 0,
    },
  };
}

export async function assessDiff(input: AssessOpts): Promise<Report> {
  const thresholds = input.thresholds ?? DEFAULT_CONFIG.thresholds;
  const collected = collectDiff({ cwd: input.cwd, base: input.base });
  if (collected.empty) {
    return {
      pack: PACK_ID,
      tool: "debt_assess_diff",
      skipped_jev: true,
      metrics: collected.metrics,
      verdict: {
        action: "allow",
        reasons: ["empty diff - nothing to assess"],
        model_tier: "cheap",
        confidence_floor: 1,
      },
    };
  }
  if (input.collectOnly) {
    return {
      pack: PACK_ID,
      tool: "debt_assess_diff",
      skipped_jev: true,
      metrics: collected.metrics,
      state_preview: collected.state,
      verdict: {
        action: "review",
        reasons: ["collect-only: Jev not called"],
        model_tier: "unknown",
        confidence_floor: 0,
      },
    };
  }
  try {
    const jev = await systemOne({
      state: collected.state,
      questions: DIFF_QUESTIONS,
      model: input.model,
    });
    return {
      pack: PACK_ID,
      tool: "debt_assess_diff",
      model: jev.model,
      usage: jev.usage,
      metrics: collected.metrics,
      answers: jev.answers,
      verdict: decideDiff(jev.answers, collected.metrics, thresholds),
    };
  } catch (err) {
    return unavailable("debt_assess_diff", err, Boolean(input.failOpen), collected.metrics);
  }
}

export async function assessFile(input: AssessOpts & { file: string }): Promise<Report> {
  const thresholds = input.thresholds ?? DEFAULT_CONFIG.thresholds;
  const collected = collectFile({ cwd: input.cwd, file: input.file });
  if (input.collectOnly) {
    return {
      pack: PACK_ID,
      tool: "debt_assess_file",
      skipped_jev: true,
      metrics: collected.metrics,
      state_preview: collected.state,
      verdict: {
        action: "review",
        reasons: ["collect-only: Jev not called"],
        model_tier: "unknown",
        confidence_floor: 0,
      },
    };
  }
  try {
    const jev = await systemOne({
      state: collected.state,
      questions: FILE_QUESTIONS,
      model: input.model,
    });
    return {
      pack: PACK_ID,
      tool: "debt_assess_file",
      model: jev.model,
      usage: jev.usage,
      metrics: collected.metrics,
      answers: jev.answers,
      verdict: decideFile(jev.answers, collected.metrics, thresholds),
    };
  } catch (err) {
    return unavailable("debt_assess_file", err, Boolean(input.failOpen), collected.metrics);
  }
}

export async function assessGate(input: AssessOpts): Promise<Report> {
  const thresholds = input.thresholds ?? DEFAULT_CONFIG.thresholds;
  const collected = collectDiff({ cwd: input.cwd, base: input.base });
  if (collected.empty) {
    return {
      pack: PACK_ID,
      tool: "debt_workaround_gate",
      skipped_jev: true,
      metrics: collected.metrics,
      verdict: {
        action: "allow",
        reasons: ["empty diff - nothing to gate"],
        model_tier: "cheap",
        confidence_floor: 1,
      },
    };
  }
  if (input.collectOnly) {
    return {
      pack: PACK_ID,
      tool: "debt_workaround_gate",
      skipped_jev: true,
      metrics: collected.metrics,
      state_preview: collected.state,
      verdict: {
        action: "review",
        reasons: ["collect-only: Jev not called"],
        model_tier: "unknown",
        confidence_floor: 0,
      },
    };
  }
  try {
    const jev = await systemOne({
      state: {
        task: "Gate whether this diff is a failure-hiding workaround.",
        ...collected.state,
      },
      questions: GATE_QUESTIONS,
      model: input.model,
    });
    return {
      pack: PACK_ID,
      tool: "debt_workaround_gate",
      model: jev.model,
      usage: jev.usage,
      metrics: collected.metrics,
      answers: jev.answers,
      verdict: decideGate(jev.answers, collected.metrics, thresholds),
    };
  } catch (err) {
    return unavailable("debt_workaround_gate", err, Boolean(input.failOpen), collected.metrics);
  }
}
