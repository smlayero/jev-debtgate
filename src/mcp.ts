#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { assessDiff, assessFile, assessGate } from "./assess.js";
import { loadDotEnv } from "./env.js";

loadDotEnv();

const server = new McpServer({
  name: "debtgate",
  version: "0.1.0",
});

function text(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

const cwdSchema = z
  .string()
  .optional()
  .describe("Repo root. Defaults to DEBTGATE_CWD or process cwd.");
const baseSchema = z
  .string()
  .optional()
  .describe(
    "git diff base. Default HEAD (staged+unstaged vs last commit). Use origin/main for PRs.",
  );
const collectSchema = z
  .boolean()
  .optional()
  .describe("If true, only run collectors (no Jev).");

server.registerTool(
  "debt_assess_diff",
  {
    title: "Assess diff for technical debt",
    description:
      "Assess a git diff for technical debt: paying down vs adding vs workaround, debt kind, severity, merge gate, and model tier. Call before declaring a refactor done or opening a PR. Collects git metrics locally; Jev only judges the summary. Do not paste whole files.",
    inputSchema: {
      cwd: cwdSchema,
      base: baseSchema,
      collect_only: collectSchema,
    },
  },
  async ({ cwd, base, collect_only }) => {
    const report = await assessDiff({
      cwd: cwd || process.env.DEBTGATE_CWD || process.cwd(),
      base,
      collectOnly: collect_only,
    });
    return text(report);
  },
);

server.registerTool(
  "debt_assess_file",
  {
    title: "Assess god-file / concentration",
    description:
      "Judge whether a file is a god file / concentration problem. Pass a path; the server reads loc, import diversity, function sizes, and git churn. Use when a module's code is piled into one file, or before splitting it. Do not paste the full source.",
    inputSchema: {
      file: z.string().describe("File path relative to cwd"),
      cwd: cwdSchema,
      collect_only: collectSchema,
    },
  },
  async ({ file, cwd, collect_only }) => {
    const report = await assessFile({
      cwd: cwd || process.env.DEBTGATE_CWD || process.cwd(),
      file,
      collectOnly: collect_only,
    });
    return text(report);
  },
);

server.registerTool(
  "debt_workaround_gate",
  {
    title: "Gate failure-hiding workarounds",
    description:
      "Gate whether a diff is hiding a symptom (timeout bump, skip, empty catch, sleep, retry) instead of fixing root cause. Call when tests just turned green after a small change, or the user claims the flake is fixed. Block labeling it as paying down debt.",
    inputSchema: {
      cwd: cwdSchema,
      base: baseSchema,
      collect_only: collectSchema,
    },
  },
  async ({ cwd, base, collect_only }) => {
    const report = await assessGate({
      cwd: cwd || process.env.DEBTGATE_CWD || process.cwd(),
      base,
      collectOnly: collect_only,
    });
    return text(report);
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
