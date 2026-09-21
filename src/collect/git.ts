import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { DiffMetrics, FileMetrics } from "../types.js";
import { truncate } from "../util.js";
import {
  analyzeSource,
  compareSources,
  emptyDiffHits,
  mergeHits,
  type DiffHits,
} from "./ast.js";
import { isCodeFile } from "./langs.js";

export { isCodeFile } from "./langs.js";
export { analyzeSource, compareSources } from "./ast.js";

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

function gitShow(cwd: string, rev: string, file: string): string | null {
  const posix = file.replaceAll("\\", "/");
  const r = git(["show", `${rev}:${posix}`], cwd);
  return r.ok ? r.stdout : null;
}

function workingTree(cwd: string, file: string): string | null {
  const abs = path.join(cwd, file);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    return fs.readFileSync(abs, "utf8");
  }
  return null;
}

function parseNameStatus(text: string): { status: string; file: string }[] {
  const rows: { status: string; file: string }[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const status = parts[0]?.trim() ?? "";
    const file = parts[parts.length - 1]?.trim();
    if (!file || status.startsWith("D")) continue;
    rows.push({ status: status[0] ?? "M", file });
  }
  return rows;
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

function analyzeChangedFiles(cwd: string, base: string): DiffHits {
  const names = git(["diff", "--name-status", "--no-renames", base], cwd);
  const hits = emptyDiffHits();
  if (!names.ok) return hits;
  let scanned = 0;
  for (const row of parseNameStatus(names.stdout)) {
    if (!isCodeFile(row.file)) continue;
    if (scanned++ >= 40) break;
    const newer = workingTree(cwd, row.file);
    const older = row.status === "A" ? null : gitShow(cwd, base, row.file);
    mergeHits(hits, compareSources(row.file, older, newer));
  }
  return hits;
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
  const analysis = analyzeChangedFiles(input.cwd, base);
  const files = parseNumstat(numstat.ok ? numstat.stdout : "");
  const added = files.reduce((s, f) => s + f.added, 0);
  const removed = files.reduce((s, f) => s + f.removed, 0);
  const metrics: DiffMetrics = {
    file_count: files.length,
    added,
    removed,
    timeout_bumps: analysis.timeout_bumps,
    skip_added: analysis.skip_added,
    empty_catch: analysis.empty_catch,
    sql_concat: analysis.sql_concat,
    type_escape: analysis.type_escape,
    sleep_added: analysis.sleep_added,
    languages: analysis.languages,
  };
  const empty = diff.trim().length === 0;
  const state = {
    task: "Assess whether this git diff pays down or adds technical debt.",
    repo: path.basename(input.cwd),
    base,
    stats: truncate((stat.stdout || "").trim() || "(no --stat)", 4000),
    files,
    static_analysis: {
      languages: metrics.languages,
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
  metrics: FileMetrics;
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
  const ast = analyzeSource(abs, source);
  const import_buckets: Record<string, number> = {};
  for (const spec of ast.imports) {
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

  const metrics: FileMetrics = {
    path: path.relative(input.cwd, abs).replaceAll("\\", "/"),
    loc,
    module_dir: path.relative(input.cwd, dir).replaceAll("\\", "/") || ".",
    module_file_count: siblings.length,
    module_loc: moduleLoc,
    share_of_module: moduleLoc === 0 ? 1 : loc / moduleLoc,
    function_count: ast.functions.length,
    class_count: ast.class_count,
    top_functions: ast.functions.slice(0, 5),
    import_buckets,
    import_bucket_diversity: diversity,
    looks_generated: looksGenerated(source, abs),
    churn_90d_commits: churn,
    language: ast.language,
  };

  const state = {
    task: "Judge whether this file is a god file / concentration problem.",
    metrics,
    head: truncate(source, 2500),
    exports_or_defs: ast.functions.slice(0, 12).map((f) => f.name),
    diff_excerpt: input.diffExcerpt ? truncate(input.diffExcerpt, 4000) : null,
  };
  return { metrics, state };
}
