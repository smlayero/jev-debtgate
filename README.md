# jev-debtgate

English · [中文](README.zh.md)

**jev-debtgate** is a gate for technical debt in agent and CI workflows.

It does not rewrite your codebase. It looks at a git diff or a single file, then returns a typed verdict: `allow`, `review`, or `block`. Local scripts collect facts. [TypeSafe Jev](https://typesafe.ai) answers a fixed set of questions. Policy in this repo turns those answers into a gate.

The point is simple: a change that makes tests green, or a file that “works,” is not automatically a cleanup. If the change borrows against the future, the gate should say so before merge.

---

## What technical debt is

**Technical debt** is the extra cost you accept now so you can ship, knowing you will have to repay it later—with interest. The name is already the standard term in software engineering. Nearby words (maintainability, code smell, quality issue) describe symptoms or attributes. They do not replace the idea of a **loan**: you took a shortcut, and tomorrow’s change is more expensive because of it.

We keep saying technical debt on purpose. There is no more unified name that still means “borrow now, pay later.” In this project it includes:

- a design you know is incomplete
- a workaround that hides a failure instead of fixing it
- responsibilities piled into one file until the next edit is unsafe
- missing tests, weaker types, unsafe queries, copy-paste, leftover APIs

A rename, a generated file, or a cohesive (even large) module is not automatically debt.

---

## How this project judges it

jev-debtgate never asks “is the code ugly?” It asks questions a process can act on.

**1. Collect facts on your machine**

A real AST pass (via [ast-grep](https://ast-grep.github.io)) parses the changed files, not a line regex over the diff. TypeScript/JavaScript ship in the core parser; Python, Go, Rust, Java, Kotlin, C#, Ruby, PHP, Swift, Scala, C, and C++ register as extra grammars. Findings include skipped tests, empty `catch` / swallowed errors, concatenated SQL, type escapes, and a test timeout raised with no production change. Function sizes and import mix also come from the tree. The full repository is not uploaded.

**2. Ask Jev the same questions every time**

On a **diff**:

- Are we paying debt down, adding it, hiding a symptom, mixing both, or doing unrelated product work?
- If debt is present, what kind is it (tests, types, security, concentration, architecture, …)?
- Is this a workaround? How severe is shipping it? Can it auto-merge? Which model tier should continue?

On a **file**:

- Are too many jobs in one place?
- Is it a god file, generated output, a data table, or a cohesive module?
- Should we split now, along which axis, or lock tests first?

**3. Apply policy to confidence, not to the top choice**

| Verdict | Meaning |
| --- | --- |
| `allow` | No meaningful debt signal, or a safe pay-down |
| `review` | Uncertain, mixed, or a split that still needs a human |
| `block` | High-confidence workaround or unsafe construction; do not label it “debt pay-down” |

Generated files and tabular dumps are not split as cleanup. If the *decision* questions are uncertain, the result is `review`, not an automatic refactor.

Read `verdict.action` and `confidence_floor`. Do not ship on argmax alone.

---

## Connect it

Bring **your own** TypeSafe API key. This repository never includes one. Node 20+ is required.

First week in a real repo: keep `shadow` and `failOpen` on. The gate prints a verdict but does not fail the job. Turn them off after it matches how you work.

### 1. One command in your repo

```bash
npx -y jev-debtgate init
```

This writes:

- `.cursor/mcp.json.example` — Cursor MCP via `npx`
- `.cursor/skills/debtgate/` — agent instructions
- `.debtgate.json` — thresholds, `shadow`, `failOpen`
- `.github/workflows/jev-debtgate.yml` — PR gate (starts in shadow)

Then copy the MCP example and paste **your** key:

```bash
cp .cursor/mcp.json.example .cursor/mcp.json
npx -y jev-debtgate doctor
```

Do not commit `.env` or `.cursor/mcp.json`.

### 2. Cursor (MCP)

`.cursor/mcp.json` after `init`:

```json
{
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
```

| Tool | Call it when |
| --- | --- |
| `debt_assess_diff` | Before you say the refactor is done, or before a PR |
| `debt_workaround_gate` | Tests just turned green after a tiny change |
| `debt_assess_file` | Most of a module lives in one file, or you are about to split it |

If you are hacking on this repository, point Cursor at `node dist/mcp.js` instead (see `.cursor/mcp.json.example` here).

### 3. CLI

```bash
npx -y jev-debtgate diff
npx -y jev-debtgate diff --base origin/main --json
npx -y jev-debtgate gate --shadow --fail-open
npx -y jev-debtgate file src/app.ts
npx -y jev-debtgate doctor
```

| Exit code | Meaning |
| --- | --- |
| `0` | allow (also shadow / fail-open) |
| `1` | review |
| `2` | block |
| `3` | error (missing key, not a git repo, …) |

`--collect-only` runs collectors without Jev. That is measurement, not a verdict.

### 4. GitHub Action

Store `TYPESAFE_API_KEY` as a repository secret. An empty `api-key` fails the job.

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: "22"
- uses: smlayero/jev-debtgate@main
  with:
    api-key: ${{ secrets.TYPESAFE_API_KEY }}
    command: diff
    base: origin/${{ github.base_ref }}
    shadow: "true"
    fail-open: "true"
```

Set `shadow` and `fail-open` to `"false"` when you want a hard gate.

### 5. Config and library

`.debtgate.json`:

```json
{
  "base": "HEAD",
  "shadow": true,
  "failOpen": true,
  "thresholds": { "auto": 0.85, "review": 0.5 }
}
```

Flags and env win over the file: `--shadow`, `--fail-open`, `DEBTGATE_SHADOW`, `DEBTGATE_FAIL_OPEN`.

Programmatic:

```ts
import { assessDiff } from "jev-debtgate";

const report = await assessDiff({
  cwd: process.cwd(),
  base: "origin/main",
  failOpen: true,
});
```

---

## Examples in this repo

| Path | What it is for |
| --- | --- |
| `examples/god-file/src/kitchen-sink.ts` | HTTP, SQL, payments, and a queue in one file |
| `examples/timeout-workaround` | Test timeout raised; production code unchanged |
| `examples/generated/api.gen.ts` | Generated output—do not treat as a split target |

```bash
npx jev-debtgate file examples/god-file/src/kitchen-sink.ts --collect-only --json
```

---

## Environment

| Variable | Default | Role |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | (required) | Your TypeSafe key |
| `JEV_MODEL` | `jev-latest` | Model alias |
| `DEBTGATE_AUTO` | `0.85` | Auto-allow floor |
| `DEBTGATE_REVIEW` | `0.5` | Below this, review |
| `DEBTGATE_SHADOW` | unset | Always exit 0 |
| `DEBTGATE_FAIL_OPEN` | unset | Jev outage → review + exit 0 |
| `DEBTGATE_CWD` | process cwd | Working tree for MCP |

```bash
npm test          # unit tests + secret scan; no API key
npm run live      # optional live Jev checks; needs your key
```

`npm test` fails if a TypeSafe-looking key is committed.

---

## License

MIT
