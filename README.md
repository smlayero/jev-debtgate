# jev-debtgate

[中文文档](README.zh.md)

Sonar will tell you a file is 3000 lines. **jev-debtgate** tells you whether that is a god file or generated code, whether this PR is paying debt down or hiding a flake, and whether a cheap model is allowed to touch it.

Local collectors gather git/file **facts**. [TypeSafe Jev](https://typesafe.ai) only returns typed probabilities. Policy in this repo maps confidence to `allow | review | block`.

This is an MCP server + CLI (with a Cursor skill). It is not an editor highlighter.

**Bring your own TypeSafe key.** This project never ships an API key. Copy `.env.example` to `.env` or set `TYPESAFE_API_KEY` yourself. Do not commit `.env` or `.cursor/mcp.json`.

## Install

```bash
npm install
npm run build
cp .env.example .env   # then paste YOUR key from https://console.typesafe.ai
npx jev-debtgate doctor
```

The CLI binary is also available as `debtgate`.

### CLI

```bash
npx jev-debtgate diff                  # staged+unstaged vs HEAD
npx jev-debtgate diff --base origin/main --json
npx jev-debtgate gate                  # workaround / fake-fix gate
npx jev-debtgate file src/app.ts
npx jev-debtgate file src/app.ts --collect-only
npx jev-debtgate init                  # copy skill + mcp.json.example
npx jev-debtgate doctor
```

Exit codes: `0` allow, `1` review, `2` block, `3` error.

### Cursor MCP

Copy `.cursor/mcp.json.example` to `.cursor/mcp.json` (gitignored) and paste **your** key into `env.TYPESAFE_API_KEY`. Point `args` at this repo’s `dist/mcp.js` after `npm run build`.

Tools:

| Tool | When |
|---|---|
| `debt_assess_diff` | Before you claim a refactor is done or open a PR |
| `debt_workaround_gate` | Tests just went green after a tiny change |
| `debt_assess_file` | Code is piled into one file / you want to split it |

The project skill `.cursor/skills/debtgate/SKILL.md` tells the agent to honor `verdict.action` instead of Jev’s argmax.

### GitHub Action

Callers pass **their** secret. The action fails if `api-key` is empty.

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

## How it decides

1. **Collect** (no Jev): diff stats, timeout/skip/SQL/empty-catch heuristics, loc, import buckets, function sizes, 90-day churn.
2. **Ask Jev** (`tech-debt.v1` pack): direction, debt kind, workaround, god-file kind, split axis, model tier.
3. **Policy**: high-confidence workaround → `block`; generated/data tables → do not split; low confidence on the *decision* questions → `review`, never auto-split.

Do not ship on `choice` alone. Honor `verdict.action` and `confidence_floor`.

## Examples

- `examples/god-file/src/kitchen-sink.ts` — HTTP + SQL + Stripe + Slack in one file
- `examples/timeout-workaround` — test timeout bump with no production fix
- `examples/generated/api.gen.ts` — generated blob; do not hand-split

```bash
npx jev-debtgate file examples/god-file/src/kitchen-sink.ts --collect-only --json
```

## Config

| Env | Default | Meaning |
|---|---|---|
| `TYPESAFE_API_KEY` | required | Your TypeSafe key |
| `JEV_MODEL` | `jev-latest` | Model alias |
| `DEBTGATE_AUTO` | `0.85` | Auto-allow floor |
| `DEBTGATE_REVIEW` | `0.5` | Below this, review |
| `DEBTGATE_CWD` | process cwd | MCP working tree |

## Develop

```bash
npm test          # policy + collectors + secret scan (no API key)
npm run live      # optional real Jev e2e; needs YOUR TYPESAFE_API_KEY
```

Never commit a key. `npm test` fails if a TypeSafe-looking `apikey_` hex string is in the tree.

## License

MIT
