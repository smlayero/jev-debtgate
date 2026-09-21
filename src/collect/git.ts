import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { DiffMetrics } from "../types.js";
import { truncate } from "../util.js";

export function git(
  args: string[],
  cwd: string,
): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, stdout, stderr: "" };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    return { ok: false, stdout: e.stdout ?? "", stderr: e.stderr ?? e.message };
  }
}

export function assertGitRepo(cwd: string): void {
  const r = git(["rev-parse", "--is-inside-work-tree"], cwd);
  if (!r.ok || r.stdout.trim() !== "true") {
    throw new Error(`Not a git repository: ${cwd}`);
  }
}

const TIMEOUT = /timeout(?:\s*[:=]\s*|\s+)\d{3,}/i;
const TIMEOUT_ARG = /^\s*\}\s*,\s*\d{3,}\s*\)\s*;?\s*$/;
const SKIP =
  /\b(it|test|describe)\.skip\b|\bxtest\b|\bxit\b|@pytest\.mark\.skip|\.skip\(/;
const EMPTY_CATCH = /catch\s*\([^)]*\)\s*\{\s*\}/g;
function isSqlConcat(line: string): boolean {
  const sql = /\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(line);
  const call = /\b(execute|query|raw)\s*\(/i.test(line);
  const concat = line.includes("+") || line.includes("${");
  return sql && concat && (call || concat);
}
const TYPE_ESCAPE = /@ts-ignore|@ts-expect-error|\bas any\b|: any\b|eslint-disable.*any/;
const SLEEP = /\b(sleep|setTimeout|time\.sleep)\s*\(/;

function addedLines(diff: string): string[] {
  return diff
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1));
}

function hits(pattern: RegExp, lines: string[], label: string): string[] {
  const out: string[] = [];
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  for (const line of lines) {
    if (re.test(line)) out.push(`${label}: ${line.trim().slice(0, 160)}`);
    re.lastIndex = 0;
  }
  return out.slice(0, 12);
}

export function analyzeDiffText(diff: string): Omit<
  DiffMetrics,
  "file_count" | "added" | "removed"
> {
  const added = addedLines(diff);
  return {
    timeout_bumps: [
      ...hits(TIMEOUT, added, "timeout"),
      ...hits(TIMEOUT_ARG, added, "timeout_arg"),
    ],
    skip_added: hits(SKIP, added, "skip"),
    empty_catch: hits(EMPTY_CATCH, added, "empty_catch"),
    sql_concat: added
      .filter(isSqlConcat)
      .slice(0, 12)
      .map((line) => `sql_concat: ${line.trim().slice(0, 160)}`),
    type_escape: hits(TYPE_ESCAPE, added, "type_escape"),
    sleep_added: hits(SLEEP, added, "sleep"),
  };
}

export function collectDiff(input: {
  cwd: string;
  base?: string;
}): {
  metrics: DiffMetrics;
  state: Record<string, unknown>;
  empty: boolean;
} {
  assertGitRepo(input.cwd);
  const head = git(["rev-parse", "--verify", "HEAD"], input.cwd);
  if (!head.ok) {
    throw new Error(
      "This repo has no commits yet, so there is no diff to assess. Make an initial commit first.",
    );
  }
  const base = input.base ?? "HEAD";
  const stat = git(["diff", "--stat", base], input.cwd);
  const numstat = git(["diff", "--numstat", base], input.cwd);
  const raw = git(["diff", "--no-color", base], input.cwd);
  if (!raw.ok) {
    throw new Error(raw.stderr || "git diff failed");
  }
  const diff = raw.stdout;
  const heuristics = analyzeDiffText(diff);
  const files = parseNumstat(numstat.ok ? numstat.stdout : "");
  const added = files.reduce((s, f) => s + f.added, 0);
  const removed = files.reduce((s, f) => s + f.removed, 0);
  const metrics: DiffMetrics = {
    file_count: files.length,
    added,
    removed,
    ...heuristics,
  };
  const empty = diff.trim().length === 0;
  const state = {
    task: "Assess whether this git diff pays down or adds technical debt.",
    repo: path.basename(input.cwd),
    base,
    stats: truncate((stat.stdout || "").trim() || "(no --stat)", 4000),
    files,
    heuristics: {
      timeout_bumps: metrics.timeout_bumps,
      skip_added: metrics.skip_added,
      empty_catch: metrics.empty_catch,
      sql_concat: metrics.sql_concat,
      type_escape: metrics.type_escape,
      sleep_added: metrics.sleep_added,
    },
    diff_excerpt: truncate(diff, 12000),
  };
  return { metrics, state, empty };
}

function parseNumstat(
  text: string,
): { path: string; added: number; removed: number }[] {
  const rows: { path: string; added: number; removed: number }[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!m) continue;
    rows.push({
      path: m[3]!.trim(),
      added: m[1] === "-" ? 0 : Number(m[1]),
      removed: m[2] === "-" ? 0 : Number(m[2]),
    });
  }
  return rows;
}

export function isCodeFile(name: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|cs|rb|php|swift|scala|vue|svelte)$/i.test(
    name,
  );
}

const BUCKETS: Record<string, string[]> = {
  db: [
    "postgres",
    "pg",
    "mysql",
    "sqlite",
    "prisma",
    "knex",
    "sequelize",
    "mongoose",
    "sqlalchemy",
    "psycopg",
    "typeorm",
    "drizzle",
  ],
  http: [
    "express",
    "fastify",
    "koa",
    "axios",
    "fetch",
    "hono",
    "flask",
    "django",
    "requests",
    "http.server",
    "next",
  ],
  ui: ["react", "vue", "svelte", "solid", "angular", "styled", "tailwind"],
  queue: ["kafka", "rabbit", "amqp", "bull", "sqs", "redis", "natch", "nats"],
  payments: ["stripe", "braintree", "paypal"],
  cloud: ["aws-sdk", "@aws-sdk", "s3", "firebase", "azure"],
  test: ["vitest", "jest", "mocha", "pytest", "playwright", "cypress", "node:test"],
};

function bucketOf(spec: string): string {
  const s = spec.toLowerCase();
  for (const [bucket, needles] of Object.entries(BUCKETS)) {
    if (needles.some((n) => s.includes(n))) return bucket;
  }
  return "other";
}

export function extractImports(source: string): string[] {
  const specs: string[] = [];
  const re =
    /(?:import(?:\s+type)?\s+[\s\S]*?\sfrom\s+|require\(|from\s+|import\s+)['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) specs.push(m[1]!);
  return specs;
}

export function extractFunctions(source: string): {
  name: string;
  approx_lines: number;
}[] {
  const lines = source.split("\n");
  const starts: { name: string; line: number }[] = [];
  const patterns: [RegExp, number][] = [
    [/^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/, 1],
    [/^\s*(?:export\s+)?class\s+(\w+)/, 1],
    [/^\s*def\s+(\w+)/, 1],
    [/^\s*func\s+(\w+)/, 1],
    [/^\s*(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/, 1],
  ];
  lines.forEach((line, i) => {
    for (const [re, g] of patterns) {
      const m = line.match(re);
      if (m) {
        starts.push({ name: m[g]!, line: i });
        break;
      }
    }
  });
  return starts
    .map((s, i) => ({
      name: s.name,
      approx_lines: (starts[i + 1]?.line ?? lines.length) - s.line,
    }))
    .sort((a, b) => b.approx_lines - a.approx_lines)
    .slice(0, 8);
}

export function looksGenerated(source: string, filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  if (/\.(pb|gen|generated)\./.test(base) || base.endsWith(".lock")) return true;
  const head = source.slice(0, 800);
  return /code generated|autogenerated|do not edit|generated by/i.test(head);
}

export function collectFile(input: {
  cwd: string;
  file: string;
  diffExcerpt?: string;
}): {
  metrics: import("../types.js").FileMetrics;
  state: Record<string, unknown>;
} {
  const abs = path.resolve(input.cwd, input.file);
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`);
  const source = fs.readFileSync(abs, "utf8");
  const loc = source.split("\n").length;
  const dir = path.dirname(abs);
  const siblings = fs
    .readdirSync(dir)
    .filter((f) => isCodeFile(f) && fs.statSync(path.join(dir, f)).isFile());
  let moduleLoc = 0;
  for (const s of siblings) {
    moduleLoc += fs.readFileSync(path.join(dir, s), "utf8").split("\n").length;
  }
  const functions = extractFunctions(source);
  const imports = extractImports(source);
  const import_buckets: Record<string, number> = {};
  for (const spec of imports) {
    const b = bucketOf(spec);
    import_buckets[b] = (import_buckets[b] ?? 0) + 1;
  }
  const diversity = Object.keys(import_buckets).filter((k) => k !== "other").length;
  let churn: number | null = null;
  const rel = path.relative(input.cwd, abs).replaceAll("\\", "/");
  const log = git(
    ["log", "--since=90 days ago", "--pretty=oneline", "--", rel],
    input.cwd,
  );
  if (log.ok) churn = log.stdout.split("\n").filter(Boolean).length;

  const classCount = (source.match(/^\s*(?:export\s+)?class\s+/gm) ?? []).length;
  const metrics = {
    path: path.relative(input.cwd, abs).replaceAll("\\", "/"),
    loc,
    module_dir: path.relative(input.cwd, dir).replaceAll("\\", "/") || ".",
    module_file_count: siblings.length,
    module_loc: moduleLoc,
    share_of_module: moduleLoc === 0 ? 1 : loc / moduleLoc,
    function_count: functions.length,
    class_count: classCount,
    top_functions: functions.slice(0, 5),
    import_buckets,
    import_bucket_diversity: diversity,
    looks_generated: looksGenerated(source, abs),
    churn_90d_commits: churn,
  };

  const state = {
    task: "Judge whether this file is a god file / concentration problem.",
    metrics,
    head: truncate(source, 2500),
    exports_or_defs: functions.slice(0, 12).map((f) => f.name),
    diff_excerpt: input.diffExcerpt ? truncate(input.diffExcerpt, 4000) : null,
  };
  return { metrics, state };
}
