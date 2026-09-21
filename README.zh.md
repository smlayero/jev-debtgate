# jev-debtgate

[English README](README.md)

Sonar 会告诉你一个文件有 3000 行。**jev-debtgate** 告诉你：这是上帝文件还是生成代码、这次 PR 是在还债还是用 timeout 藏 flake、能不能让便宜模型继续改。

本地收集器只采集 git/文件**事实**。[TypeSafe Jev](https://typesafe.ai) 只返回带类型的概率。本仓库的策略把置信度映射成 `allow | review | block`。

这是 MCP 服务 + CLI（附 Cursor Skill），不是编辑器红线插件。

**请使用你自己的 TypeSafe API Key。** 本项目不内置密钥。把 `.env.example` 复制为 `.env`，或自行设置 `TYPESAFE_API_KEY`。不要提交 `.env` 或 `.cursor/mcp.json`。

## 安装

```bash
npm install
npm run build
cp .env.example .env   # 从 https://console.typesafe.ai 粘贴你自己的 key
npx jev-debtgate doctor
```

命令行二进制也叫 `debtgate`。

### CLI

```bash
npx jev-debtgate diff                  # 相对 HEAD 的已暂存+未暂存改动
npx jev-debtgate diff --base origin/main --json
npx jev-debtgate gate                  # 假修复 / workaround 闸门
npx jev-debtgate file src/app.ts
npx jev-debtgate file src/app.ts --collect-only
npx jev-debtgate init                  # 复制 skill 和 mcp.json.example
npx jev-debtgate doctor
```

退出码：`0` 放行，`1` 复核，`2` 拦截，`3` 错误。

### Cursor MCP

把 `.cursor/mcp.json.example` 复制为 `.cursor/mcp.json`（已 gitignore），在 `env.TYPESAFE_API_KEY` 里填**你自己的** key。`npm run build` 之后，把 `args` 指到本仓的 `dist/mcp.js`。

工具：

| 工具 | 何时调用 |
|---|---|
| `debt_assess_diff` | 宣称重构完成或开 PR 之前 |
| `debt_workaround_gate` | 测试刚因一个小改动变绿时 |
| `debt_assess_file` | 模块代码堆在一个文件里，或准备拆文件时 |

项目 Skill `.cursor/skills/debtgate/SKILL.md` 要求 Agent 遵守 `verdict.action`，不要只看 Jev 的 argmax。

### GitHub Action

调用方传入**自己的** Secret。`api-key` 为空时 Action 会失败。

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

## 判定流程

1. **收集**（不调用 Jev）：diff 统计、timeout/skip/SQL/空 catch 启发式、行数、import 分类、函数大小、90 天 churn。
2. **询问 Jev**（`tech-debt.v1` 问题包）：方向、债类型、workaround、上帝文件类型、拆分轴、模型档位。
3. **策略**：高置信度 workaround → `block`；生成代码/数据表 → 不要手拆；决策题置信度低 → `review`，绝不自动拆文件。

不要只看 `choice`。以 `verdict.action` 和 `confidence_floor` 为准。

## 示例

- `examples/god-file/src/kitchen-sink.ts` — 一个文件里混了 HTTP、SQL、Stripe、Slack
- `examples/timeout-workaround` — 只加长测试 timeout、没有修生产代码
- `examples/generated/api.gen.ts` — 生成物，不要手拆

```bash
npx jev-debtgate file examples/god-file/src/kitchen-sink.ts --collect-only --json
```

## 配置

| 环境变量 | 默认 | 含义 |
|---|---|---|
| `TYPESAFE_API_KEY` | 必填 | 你自己的 TypeSafe key |
| `JEV_MODEL` | `jev-latest` | 模型别名 |
| `DEBTGATE_AUTO` | `0.85` | 自动放行阈值 |
| `DEBTGATE_REVIEW` | `0.5` | 低于此值则复核 |
| `DEBTGATE_CWD` | 进程 cwd | MCP 工作树 |

## 开发

```bash
npm test          # 策略 + 收集器 + 密钥扫描（不需要 API key）
npm run live      # 可选的真实 Jev 端到端；需要你自己的 TYPESAFE_API_KEY
```

永远不要提交 key。树里如果出现 TypeSafe 风格的 `apikey_` 十六进制字符串，`npm test` 会失败。

## 许可证

MIT
