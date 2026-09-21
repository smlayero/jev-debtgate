#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assessDiff, assessFile, assessGate } from "./assess.js";
import { loadConfig, mergeRunOptions } from "./config.js";
import { isPlaceholderKey, loadDotEnv, maskKey } from "./env.js";
import { initProject } from "./init.js";
import { exitCode } from "./policy.js";
import type { Report } from "./types.js";
import { flagBool, flagString, parseArgs } from "./util.js";

loadDotEnv();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function printHelp(): void {
  console.log(`jev-debtgate - technical debt gate for agents and CI

Usage:
  jev-debtgate diff [--base REF] [--cwd DIR] [--json] [--collect-only] [--shadow] [--fail-open] [--format github]
  jev-debtgate gate [--base REF] [--cwd DIR] [--json] [--collect-only] [--shadow] [--fail-open]
  jev-debtgate file <path> [--cwd DIR] [--json] [--collect-only] [--shadow] [--fail-open]
  jev-debtgate mcp
  jev-debtgate init [--cwd DIR]
  jev-debtgate doctor [--cwd DIR]
  jev-debtgate help

Exit codes: 0 allow, 1 review, 2 block, 3 error
  --shadow     always exit 0 (print the verdict; use this first in CI)
  --fail-open  if Jev is down, review + exit 0 instead of failing the job

Bring your own TypeSafe key:
  copy .env.example to .env
  or set TYPESAFE_API_KEY in .cursor/mcp.json
`);
}

function formatHuman(report: Report): string {
  const extra = [
    report.shadow ? "shadow=true" : null,
    report.fail_open ? "fail_open=true" : null,
  ].filter(Boolean);
  const lines = [
    `jev-debtgate  pack=${report.pack}  tool=${report.tool}  action=${report.verdict.action}`,
    extra.length ? extra.join("  ") : null,
    `model=${report.model ?? "(skipped)"}  tier=${report.verdict.model_tier}  confidence_floor=${report.verdict.confidence_floor}`,
    report.usage
      ? `tokens in=${report.usage.input_tokens} out=${report.usage.output_tokens}`
      : null,
    "reasons:",
    ...report.verdict.reasons.map((r) => `  - ${r}`),
  ].filter(Boolean);
  return lines.join("\n");
}

function formatGithub(report: Report): string {
  const title = `jev-debtgate ${report.verdict.action}`;
  const body = report.verdict.reasons.join("; ");
  if (report.verdict.action === "block" && !report.shadow) {
    return `::error title=${title}::${body}`;
  }
  if (report.verdict.action === "review" || report.shadow) {
    return `::warning title=${title}::${body}`;
  }
  return `::notice title=${title}::${body}`;
}

async function emit(
  report: Report,
  flags: Record<string, string | boolean>,
  shadow: boolean,
): Promise<never> {
  report.shadow = shadow;
  const json = flagBool(flags, "json");
  const format = flagString(flags, "format") ?? "human";
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (format === "github") {
    console.log(formatGithub(report));
    console.log(formatHuman(report));
  } else {
    console.log(formatHuman(report));
  }
  if (shadow || report.fail_open) process.exit(0);
  process.exit(exitCode(report.verdict.action));
}

function doctor(cwd: string): void {
  const lines: string[] = [];
  lines.push(`cwd=${cwd}`);
  lines.push(`node=${process.version}`);
  const cli = path.join(root, "dist", "cli.js");
  lines.push(`built=${fs.existsSync(cli) ? "yes" : "no (npm run build)"}`);
  lines.push(`git_repo=${fs.existsSync(path.join(cwd, ".git")) ? "yes" : "no"}`);
  const cfg = fs.existsSync(path.join(cwd, ".debtgate.json"))
    ? loadConfig(cwd)
    : null;
  lines.push(
    `.debtgate.json=${cfg ? `present shadow=${Boolean(cfg.shadow)} failOpen=${Boolean(cfg.failOpen)}` : "missing (jev-debtgate init)"}`,
  );
  lines.push(
    `.env=${fs.existsSync(path.join(cwd, ".env")) ? "present (gitignored)" : "missing"}`,
  );
  lines.push(
    `mcp.json=${fs.existsSync(path.join(cwd, ".cursor", "mcp.json")) ? "present (gitignored)" : "missing"}`,
  );
  loadDotEnv(cwd);
  const key = process.env.TYPESAFE_API_KEY?.trim() ?? "";
  if (!key) lines.push("api_key=missing");
  else if (isPlaceholderKey(key)) lines.push("api_key=placeholder");
  else lines.push(`api_key=set ${maskKey(key)}`);
  console.log(lines.join("\n"));
  if (!key || isPlaceholderKey(key)) process.exit(3);
}

async function main(): Promise<void> {
  const { command, positional, flags } = parseArgs(process.argv);
  const cwd = path.resolve(flagString(flags, "cwd") ?? process.cwd());

  try {
    if (command === "help" || command === "-h" || command === "--help") {
      printHelp();
      process.exit(0);
    }
    if (command === "mcp") {
      const { startMcpServer } = await import("./mcp.js");
      await startMcpServer();
      return;
    }
    if (command === "init") {
      const logs = initProject({ cwd, root });
      console.log(logs.join("\n"));
      process.exit(0);
    }
    if (command === "doctor") {
      doctor(cwd);
      process.exit(0);
    }
    if (command === "version") {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
      console.log(pkg.version);
      process.exit(0);
    }

    const opts = mergeRunOptions(cwd, {
      base: flagString(flags, "base"),
      model: flagString(flags, "model"),
      shadow: flagBool(flags, "shadow"),
      failOpen: flagBool(flags, "fail-open"),
      collectOnly: flagBool(flags, "collect-only"),
    });

    if (command === "diff") {
      await emit(await assessDiff(opts), flags, opts.shadow);
    }
    if (command === "file") {
      const file = positional[0];
      if (!file) throw new Error("jev-debtgate file <path> is required");
      await emit(await assessFile({ ...opts, file }), flags, opts.shadow);
    }
    if (command === "gate") {
      await emit(await assessGate(opts), flags, opts.shadow);
    }
    printHelp();
    process.exit(3);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    const failOpen =
      flagBool(flags, "fail-open") ||
      process.env.DEBTGATE_FAIL_OPEN === "1" ||
      process.env.DEBTGATE_FAIL_OPEN === "true";
    process.exit(failOpen ? 0 : 3);
  }
}

main();
