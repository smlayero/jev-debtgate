#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { assessDiff, assessFile, assessGate } from "./assess.js";
import { loadDotEnv } from "./env.js";
import { mergeRunOptions } from "./config.js";

export async function startMcpServer(): Promise<void> {
  loadDotEnv();
  const server = new McpServer({
    name: "jev-debtgate",
    version: "0.3.0",
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
    .describe("git diff base. Default from .debtgate.json or HEAD.");
  const collectSchema = z.boolean().optional();

  server.registerTool(
    "debt_assess_diff",
    {
      title: "Assess diff for technical debt",
      description:
        "Assess a git diff for technical debt. Call before declaring a refactor done or opening a PR. Do not paste whole files.",
      inputSchema: { cwd: cwdSchema, base: baseSchema, collect_only: collectSchema },
    },
    async ({ cwd, base, collect_only }) => {
      const root = cwd || process.env.DEBTGATE_CWD || process.cwd();
      const opts = mergeRunOptions(root, { base, collectOnly: collect_only });
      const report = await assessDiff(opts);
      return text(report);
    },
  );

  server.registerTool(
    "debt_assess_file",
    {
      title: "Assess god-file / concentration",
      description:
        "Judge whether a file is a concentration problem. Pass a path; do not paste the full source.",
      inputSchema: {
        file: z.string().describe("File path relative to cwd"),
        cwd: cwdSchema,
        collect_only: collectSchema,
      },
    },
    async ({ file, cwd, collect_only }) => {
      const root = cwd || process.env.DEBTGATE_CWD || process.cwd();
      const opts = mergeRunOptions(root, { collectOnly: collect_only });
      const report = await assessFile({ ...opts, file });
      return text(report);
    },
  );

  server.registerTool(
    "debt_workaround_gate",
    {
      title: "Gate failure-hiding workarounds",
      description:
        "Gate whether a diff hides a symptom instead of fixing root cause. Call when tests just turned green.",
      inputSchema: { cwd: cwdSchema, base: baseSchema, collect_only: collectSchema },
    },
    async ({ cwd, base, collect_only }) => {
      const root = cwd || process.env.DEBTGATE_CWD || process.cwd();
      const opts = mergeRunOptions(root, { base, collectOnly: collect_only });
      const report = await assessGate(opts);
      return text(report);
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const entry = process.argv[1]?.replaceAll("\\", "/");
if (entry && (entry.endsWith("/mcp.js") || entry.endsWith("/mcp.ts"))) {
  await startMcpServer();
}
