import fs from "node:fs";
import path from "node:path";
import type { Thresholds } from "./types.js";

export type DebtgateConfig = {
  base?: string;
  model?: string;
  shadow?: boolean;
  failOpen?: boolean;
  thresholds?: Partial<Thresholds>;
};

function envFlag(name: string): boolean {
  const v = process.env[name];
  return v === "1" || v === "true";
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function defaultThresholds(): Thresholds {
  return {
    auto: envNumber("DEBTGATE_AUTO", 0.85),
    review: envNumber("DEBTGATE_REVIEW", 0.5),
  };
}

export const DEFAULT_CONFIG: Required<Pick<DebtgateConfig, "shadow" | "failOpen">> & {
  thresholds: Thresholds;
} = {
  shadow: false,
  failOpen: false,
  get thresholds() {
    return defaultThresholds();
  },
};

function asBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function loadConfig(cwd: string): DebtgateConfig {
  const file = path.join(cwd, ".debtgate.json");
  if (!fs.existsSync(file)) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(
      `Invalid .debtgate.json: ${err instanceof Error ? err.message : err}`,
    );
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid .debtgate.json: expected an object");
  }
  const obj = raw as Record<string, unknown>;
  const thresholdsRaw =
    obj.thresholds && typeof obj.thresholds === "object" && !Array.isArray(obj.thresholds)
      ? (obj.thresholds as Record<string, unknown>)
      : undefined;
  return {
    base: asString(obj.base),
    model: asString(obj.model),
    shadow: asBool(obj.shadow),
    failOpen: asBool(obj.failOpen),
    thresholds: thresholdsRaw
      ? {
          auto: asNumber(thresholdsRaw.auto),
          review: asNumber(thresholdsRaw.review),
        }
      : undefined,
  };
}

export function mergeRunOptions(
  cwd: string,
  flags: {
    base?: string;
    model?: string;
    shadow?: boolean;
    failOpen?: boolean;
    collectOnly?: boolean;
  },
): {
  cwd: string;
  base?: string;
  model?: string;
  shadow: boolean;
  failOpen: boolean;
  collectOnly: boolean;
  thresholds: Thresholds;
} {
  const file = loadConfig(cwd);
  const defaults = defaultThresholds();
  return {
    cwd,
    base: flags.base ?? file.base,
    model: flags.model ?? file.model,
    shadow: Boolean(flags.shadow) || envFlag("DEBTGATE_SHADOW") || Boolean(file.shadow),
    failOpen:
      Boolean(flags.failOpen) || envFlag("DEBTGATE_FAIL_OPEN") || Boolean(file.failOpen),
    collectOnly: Boolean(flags.collectOnly),
    thresholds: {
      auto: file.thresholds?.auto ?? defaults.auto,
      review: file.thresholds?.review ?? defaults.review,
    },
  };
}
