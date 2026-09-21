import { collectDiff, collectFile } from "./collect/git.js";
import { systemOne } from "./jev.js";
import { DIFF_QUESTIONS, FILE_QUESTIONS, GATE_QUESTIONS } from "./packs.js";
import { decideDiff, decideFile, decideGate } from "./policy.js";
import type { Report } from "./types.js";
import { PACK_ID } from "./util.js";

export async function assessDiff(input: {
  cwd: string;
  base?: string;
  collectOnly?: boolean;
  model?: string;
}): Promise<Report> {
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
    verdict: decideDiff(jev.answers, collected.metrics),
  };
}

export async function assessFile(input: {
  cwd: string;
  file: string;
  collectOnly?: boolean;
  model?: string;
}): Promise<Report> {
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
    verdict: decideFile(jev.answers, collected.metrics),
  };
}

export async function assessGate(input: {
  cwd: string;
  base?: string;
  collectOnly?: boolean;
  model?: string;
}): Promise<Report> {
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
    verdict: decideGate(jev.answers, collected.metrics),
  };
}
