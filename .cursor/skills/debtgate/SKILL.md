---
name: debtgate
description: Assess technical debt with jev-debtgate (Jev): pay-down vs add-debt, god files, timeout/skip workarounds, and model tier. Use when refactoring, splitting a large file, claiming a flake is fixed, opening a PR, or the user mentions tech debt, god file, or merge gates.
---

# jev-debtgate

Local collectors measure git/file facts. TypeSafe Jev only judges the summary. Policy maps confidence to `allow | review | block`.

## When to call

1. Before declaring a refactor or "debt pay-down" done → `debt_assess_diff`
2. Tests just turned green after a tiny change → `debt_workaround_gate`
3. A module's code lives in one file, or the user wants to split it → `debt_assess_file`
4. Choosing cheap vs reasoning model for the next edit → read `verdict.model_tier`

Prefer MCP tools. If MCP is missing, run:

```bash
npx -y jev-debtgate diff --json
npx -y jev-debtgate gate --json
npx -y jev-debtgate file path/to/file.ts --json
```

Need `TYPESAFE_API_KEY` set to **the user's** TypeSafe key (env, `.env`, or `.cursor/mcp.json`). Never read a key from the repo. `--collect-only` skips Jev and is not a verdict.

## Rules

- Do not paste whole source files into Jev. Pass a path; collectors build `state`.
- Do not treat `choice` as truth. Honor `verdict.action` and `confidence_floor`.
- `block`: do not merge, do not label as paying down debt, keep investigating.
- `review`: ask the user; do not auto-split a god file.
- `allow`: continue. Mechanical follow-ups may use `cheap` if `model_tier` says so.
- `kind=generated` or `data_table`: do not hand-split.
- `split_axis=test_first` or high `missing_tests`: add tests before extracting files.
- Low `confidence_floor` (< 0.5): escalate to a human or a stronger coding model. Do not auto-split.
- If `fail_open` is true, Jev was down: treat as `review`, do not invent a pass.

## Output

JSON with `verdict.action`, `verdict.reasons`, `verdict.model_tier`, `answers`, `metrics`. Quote those fields to the user; do not invent a prose review that contradicts them.
