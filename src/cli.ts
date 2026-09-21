#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assessDiff, assessFile, assessGate } from "./assess.js";
import { isPlaceholderKey, loadDotEnv, maskKey } from "./env.js";
import { exitCode } from "./policy.js";
import type { Report } from "./types.js";
import { flagBool, flagString, parseArgs } from "./util.js";

loadDotEnv();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function printHelp(): void {
  console.log(`Debtgate - Jev technical-debt gate

Usage:
  debtgate diff [--base HEAD] [--cwd DIR] [--json] [--collect-only] [--format github]
  debtgate file <path> [--cwd DIR] [--json] [--collect-only]
  debtgate gate [--base HEAD] [--cwd DIR] [--json] [--collect-only]
  debtgate init [--cwd DIR]
  debtgate doctor [--cwd DIR]
  debtgate help

Exit codes: 0 allow, 1 review, 2 block, 3 error

Bring your own TypeSafe key (never commit it):
  copy .env.example to .env
  or set TYPESAFE_API_KEY in the environment / .cursor/mcp.json

Env:
  TYPESAFE_API_KEY   required unless --collect-only
  JEV_MODEL          default jev-latest
  DEBTGATE_AUTO      auto-merge confidence (default 0.85)
  DEBTGATE_REVIEW    review floor (default 0.5)
`);
}

function formatHuman(report: Report): string {
  const lines = [
    `Debtgate  pack=${report.pack}  tool=${report.tool}  action=${report.verdict.action}`,
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
  const title = `Debtgate ${report.verdict.action}`;
  const body = report.verdict.reasons.join("; ");
  if (report.verdict.action === "block") {
    return `::error title=${title}::${body}`;
  }
  if (report.verdict.action === "review") {
    return `::warning title=${title}::${body}`;
  }
  return `::notice title=${title}::${body}`;
}

async function emit(report: Report, flags: Record<string, string | boolean>): Promise<never> {
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
  process.exit(exitCode(report.verdict.action));
}

function init(cwd: string): void {
  const skillSrc = path.join(root, "skills", "debtgate");
  const skillDst = path.join(cwd, ".cursor", "skills", "debtgate");
  fs.mkdirSync(skillDst, { recursive: true });
  for (const name of fs.readdirSync(skillSrc)) {
    fs.copyFileSync(path.join(skillSrc, name), path.join(skillDst, name));
  }
  const mcpExample = path.join(cwd, ".cursor", "mcp.json.example");
  const mcp = {
    mcpServers: {
      debtgate: {
        command: "node",
        args: [path.join(root, "dist", "mcp.js")],
        env: { TYPESAFE_API_KEY: "" },
      },
    },
  };
  fs.mkdirSync(path.dirname(mcpExample), { recursive: true });
  fs.writeFileSync(mcpExample, JSON.stringify(mcp, null, 2) + "\n");
  console.log(`Wrote ${path.relative(cwd, skillDst)} and .cursor/mcp.json.example`);
  console.log("Copy mcp.json.example to .cursor/mcp.json and paste YOUR own TypeSafe key.");
  console.log("Do not commit .cursor/mcp.json or .env.");
}

function doctor(cwd: string): void {
  const lines: string[] = [];
  lines.push(`cwd=${cwd}`);
  lines.push(`node=${process.version}`);
  const cli = path.join(root, "dist", "cli.js");
  lines.push(`built=${fs.existsSync(cli) ? "yes" : "no (run npm run build)"}`);
  const git = fs.existsSync(path.join(cwd, ".git"));
  lines.push(`git_repo=${git ? "yes" : "no"}`);
  const envFile = fs.existsSync(path.join(cwd, ".env"));
  lines.push(`.env_file=${envFile ? "present (gitignored)" : "missing (copy .env.example)"}`);
  const mcp = fs.existsSync(path.join(cwd, ".cursor", "mcp.json"));
  lines.push(`mcp.json=${mcp ? "present (gitignored)" : "missing (copy .cursor/mcp.json.example)"}`);
  loadDotEnv(cwd);
  const key = process.env.TYPESAFE_API_KEY?.trim() ?? "";
  if (!key) lines.push("api_key=missing");
  else if (isPlaceholderKey(key)) lines.push("api_key=placeholder (put YOUR key, not the example string)");
  else lines.push(`api_key=set ${maskKey(key)}`);
  console.log(lines.join("\n"));
  if (!key || isPlaceholderKey(key) || !fs.existsSync(cli)) process.exit(3);
}

async function main(): Promise<void> {
  const { command, positional, flags } = parseArgs(process.argv);
  const cwd = path.resolve(flagString(flags, "cwd") ?? process.cwd());
  const collectOnly = flagBool(flags, "collect-only");
  const base = flagString(flags, "base");
  const model = flagString(flags, "model");

  try {
    if (command === "help" || command === "-h" || command === "--help") {
      printHelp();
      process.exit(0);
    }
    if (command === "init") {
      init(cwd);
      process.exit(0);
    }
    if (command === "doctor") {
      doctor(cwd);
      process.exit(0);
    }
    if (command === "diff") {
      await emit(await assessDiff({ cwd, base, collectOnly, model }), flags);
    }
    if (command === "file") {
      const file = positional[0];
      if (!file) throw new Error("debtgate file <path> is required");
      await emit(await assessFile({ cwd, file, collectOnly, model }), flags);
    }
    if (command === "gate") {
      await emit(await assessGate({ cwd, base, collectOnly, model }), flags);
    }
    if (command === "version") {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
      console.log(pkg.version);
      process.exit(0);
    }
    printHelp();
    process.exit(3);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(3);
  }
}

main();
