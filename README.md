# jev-debtgate

English · [中文](README.zh.md)

A gate for **technical debt**.

Coding agents write code quickly. They also leave timeout bumps, SQL string concat, and “one more function” in a file that already does too much. **jev-debtgate** exists to stop that from being called a cleanup.

It looks at a diff or a file and answers a few questions your process actually needs:

- Are we paying debt down, or adding more?
- Is this a real fix, or a workaround that hides the symptom?
- Is this file a pile of mixed responsibilities, generated output, or something we should leave alone?
- If work continues, should a cheap model keep going, or do we need a stronger one?

The verdict is `allow`, `review`, or `block`. Code does not merge itself on a guess.

---

## How it thinks

1. **Facts stay local.** Line counts, import mix, git churn, and patterns like skipped tests or concatenated SQL are collected on your machine. The full repo is not uploaded.
2. **Judgment goes to [TypeSafe Jev](https://typesafe.ai).** Jev is a decision model: you send state plus typed questions, and you get probabilities—not a review essay.
3. **Policy is ours.** Confidence decides the gate. A high-confidence workaround is blocked. Generated files are not “split as debt pay-down.” If the important questions are uncertain, the result is `review`, not an automatic refactor.

Use `verdict.action` and `confidence_floor`. Do not ship on the first-ranked `choice` alone.

---

## Install

Bring **your own** TypeSafe API key. This repository never includes one.

```bash
git clone https://github.com/smlayero/jev-debtgate.git
cd jev-debtgate
npm install
npm run build
cp .env.example .env    # paste your key from https://console.typesafe.ai
npx jev-debtgate doctor
```

Do not commit `.env` or `.cursor/mcp.json`. The CLI is also available as `debtgate`.

---

## Commands

```bash
npx jev-debtgate diff                     # current uncommitted diff vs HEAD
npx jev-debtgate diff --base origin/main --json
npx jev-debtgate gate                     # fake-fix / workaround gate
npx jev-debtgate file src/app.ts          # god-file / concentration
npx jev-debtgate file src/app.ts --collect-only
npx jev-debtgate init
npx jev-debtgate doctor
```

| Exit code | Meaning |
| --- | --- |
| `0` | allow |
| `1` | review |
| `2` | block |
| `3` | error (missing key, not a git repo, …) |

`--collect-only` runs collectors without Jev. That is measurement, not a verdict.

---

## In Cursor

1. `npm run build`
2. Copy `.cursor/mcp.json.example` → `.cursor/mcp.json`
3. Put **your** key in `env.TYPESAFE_API_KEY`
4. Point `args` at this repo’s `dist/mcp.js`

| Tool | Call it when |
| --- | --- |
| `debt_assess_diff` | Before you say the refactor is done, or before a PR |
| `debt_workaround_gate` | Tests just turned green after a tiny change |
| `debt_assess_file` | Most of a module lives in one file, or you are about to split it |

The skill in `.cursor/skills/debtgate/SKILL.md` tells the agent to obey the gate.

---

## In GitHub Actions

Pass **your** repository secret. An empty `api-key` fails the job.

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: "22"
- uses: smlayero/jev-debtgate@main
  with:
    api-key: ${{ secrets.TYPESAFE_API_KEY }}
    command: diff
    base: ${{ github.event.pull_request.base.sha }}
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
| `DEBTGATE_CWD` | process cwd | Working tree for MCP |

```bash
npm test          # unit tests + secret scan; no API key
npm run live      # optional live Jev checks; needs your key
```

`npm test` fails if a TypeSafe-looking key is committed.

---

## License

MIT
