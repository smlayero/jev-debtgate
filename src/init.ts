import fs from "node:fs";
import path from "node:path";

const MCP_FALLBACK = `{
  "mcpServers": {
    "jev-debtgate": {
      "command": "npx",
      "args": ["-y", "jev-debtgate", "mcp"],
      "env": {
        "TYPESAFE_API_KEY": ""
      }
    }
  }
}
`;

const DEBTGATE_FALLBACK = `{
  "base": "HEAD",
  "shadow": true,
  "failOpen": true,
  "thresholds": {
    "auto": 0.85,
    "review": 0.5
  }
}
`;

const WORKFLOW_FALLBACK = `name: jev-debtgate

on:
  pull_request:

jobs:
  technical-debt:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - uses: smlayero/jev-debtgate@main
        with:
          api-key: \${{ secrets.TYPESAFE_API_KEY }}
          command: diff
          base: origin/\${{ github.base_ref }}
          shadow: "true"
          fail-open: "true"
`;

function readTemplate(root: string, name: string, fallback: string): string {
  const file = path.join(root, "templates", name);
  if (!fs.existsSync(file)) return fallback;
  return fs.readFileSync(file, "utf8");
}

function writeIfMissing(cwd: string, file: string, contents: string): string {
  const rel = path.relative(cwd, file).replaceAll("\\", "/") || path.basename(file);
  if (fs.existsSync(file)) return `skip ${rel} (exists)`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents.endsWith("\n") ? contents : `${contents}\n`);
  return `write ${rel}`;
}

export function initProject(input: { cwd: string; root: string }): string[] {
  const { cwd, root } = input;
  const logs: string[] = [];
  const skillSrc = path.join(root, "skills", "debtgate");
  if (!fs.existsSync(skillSrc)) {
    throw new Error(`Skill pack missing at ${skillSrc}. Reinstall jev-debtgate.`);
  }
  const skillDst = path.join(cwd, ".cursor", "skills", "debtgate");
  fs.mkdirSync(skillDst, { recursive: true });
  for (const name of fs.readdirSync(skillSrc)) {
    fs.copyFileSync(path.join(skillSrc, name), path.join(skillDst, name));
  }
  logs.push(
    `write ${path.relative(cwd, skillDst).replaceAll("\\", "/") || ".cursor/skills/debtgate"}`,
  );
  logs.push(
    writeIfMissing(
      cwd,
      path.join(cwd, ".cursor", "mcp.json.example"),
      readTemplate(root, "mcp.json.example", MCP_FALLBACK),
    ),
  );
  logs.push(
    writeIfMissing(
      cwd,
      path.join(cwd, ".debtgate.json"),
      readTemplate(root, "debtgate.json", DEBTGATE_FALLBACK),
    ),
  );
  logs.push(
    writeIfMissing(
      cwd,
      path.join(cwd, ".github", "workflows", "jev-debtgate.yml"),
      readTemplate(root, "github-workflow.yml", WORKFLOW_FALLBACK),
    ),
  );
  logs.push(
    "Next: copy .cursor/mcp.json.example to .cursor/mcp.json and paste YOUR TypeSafe key.",
  );
  logs.push(
    "Keep shadow/failOpen true until the gate matches your repo, then set them false.",
  );
  logs.push("Do not commit .cursor/mcp.json or .env.");
  return logs;
}
