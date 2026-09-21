# jev-debtgate

[English](README.md) · 中文

**jev-debtgate** 是给技术债用的闸门，用在编码 Agent 和 CI 流程里。

它不负责改仓库。它看一次 git diff 或一个文件，给出带类型的结论：`allow`、`review` 或 `block`。本地脚本采集事实，[TypeSafe Jev](https://typesafe.ai) 回答一组固定问题，本仓库的策略再把答案变成闸门。

想法很直接：测试变绿、程序能跑，并不等于这次是在清理。如果这次改动是在向未来借时间，合入之前闸门应该说出来。

---

## 什么是技术债

**技术债**指：为了先交付，你现在接受了一笔额外成本，并且清楚以后要连本带利还上。这已经是软件工程里最统一的叫法。旁边的词——可维护性、代码坏味道、质量问题——描述的是症状或属性，替不掉「贷款」这个意思：你走了捷径，明天再改会更贵。

本项目继续用「技术债」，没有另造更统一的名词。能表达「先欠后还、会生利息」的，行业里就是这个词。在这里它包括：

- 你明知不完整、以后要补的设计
- 把失败藏起来、而不是修根因的 workaround
- 职责堆在一个文件里，再改就不安全
- 缺测试、类型逃逸、不安全的查询、复制粘贴、该淘汰却还在用的 API

改名、生成代码、主题单一（哪怕比较大）的模块，并不自动算债。

---

## 这个项目怎么判断技术债

jev-debtgate 不问「代码好不好看」，只问流程里能执行的问题。

**1. 在你的机器上采集事实**

行数、import 种类、函数大小、90 天 churn，以及跳过测试、空 `catch`、SQL 拼接、只加长测试 timeout 而生产代码没动等模式。不会上传整个仓库。

**2. 每次向 Jev 问同一组问题**

对 **diff**：

- 这次是在还债、欠债、藏症状、两者都有，还是无关的功能改动？
- 若有债，主要是哪一类（测试、类型、安全、集中、架构……）？
- 是不是 workaround？合入有多严重？能否自动合？下一刀用哪档模型？

对 **文件**：

- 是不是太多职责挤在一处？
- 是上帝文件、生成物、数据表，还是内聚模块？
- 现在该不该拆、沿哪条轴拆，还是先把测试锁住？

**3. 按置信度走策略，不按第一名选项**

| 结论 | 含义 |
| --- | --- |
| `allow` | 没有实质债信号，或这是一次安全的还债 |
| `review` | 说不准、结果混杂，或拆分仍需要人看 |
| `block` | 高置信度 workaround 或不安全的写法；不能标成「还债」 |

生成文件和表格式倾倒不当成拆分清理。关键决策题不确定时，结果是 `review`，不会自动重构。

请读 `verdict.action` 和 `confidence_floor`，不要只看 argmax。

---

## 接入

使用**你自己的** TypeSafe API Key。本仓库不附带密钥。需要 Node 20+。

实战第一周：保持 `shadow` 和 `failOpen` 打开。闸门会打印结论，但不会把任务判失败。等它和你的仓库对上了，再关掉。

### 1. 在你的仓库里一条命令

```bash
npx -y github:smlayero/jev-debtgate init
```

会写入：

- `.cursor/mcp.json.example` — 用 `npx` 接 Cursor MCP
- `.cursor/skills/debtgate/` — 给 Agent 的说明
- `.debtgate.json` — 阈值、`shadow`、`failOpen`
- `.github/workflows/jev-debtgate.yml` — PR 闸门（默认 shadow）

然后复制 MCP 示例，填入**你的** key：

```bash
cp .cursor/mcp.json.example .cursor/mcp.json
npx -y github:smlayero/jev-debtgate doctor
```

不要提交 `.env` 或 `.cursor/mcp.json`。

### 2. Cursor（MCP）

`init` 之后的 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "jev-debtgate": {
      "command": "npx",
      "args": ["-y", "github:smlayero/jev-debtgate", "mcp"],
      "env": {
        "TYPESAFE_API_KEY": ""
      }
    }
  }
}
```

| 工具 | 何时调用 |
| --- | --- |
| `debt_assess_diff` | 宣称重构完成，或准备开 PR 之前 |
| `debt_workaround_gate` | 测试刚因一个很小的改动变绿时 |
| `debt_assess_file` | 模块代码堆在一个文件里，或准备拆文件时 |

如果你在改本仓库，请把 Cursor 指到 `node dist/mcp.js`（见本仓的 `.cursor/mcp.json.example`）。

### 3. 命令行

```bash
npx -y github:smlayero/jev-debtgate diff
npx -y github:smlayero/jev-debtgate diff --base origin/main --json
npx -y github:smlayero/jev-debtgate gate --shadow --fail-open
npx -y github:smlayero/jev-debtgate file src/app.ts
npx -y github:smlayero/jev-debtgate doctor
```

| 退出码 | 含义 |
| --- | --- |
| `0` | 放行（shadow / fail-open 也是 0） |
| `1` | 复核 |
| `2` | 拦截 |
| `3` | 错误（缺 key、不是 git 仓库等） |

`--collect-only` 只跑本地采集，不调用 Jev，那是度量，不是裁定。

### 4. GitHub Action

把 `TYPESAFE_API_KEY` 存成仓库 Secret。`api-key` 为空时任务失败。

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

要做成硬闸门时，把 `shadow` 和 `fail-open` 改成 `"false"`。

### 5. 配置和库

`.debtgate.json`：

```json
{
  "base": "HEAD",
  "shadow": true,
  "failOpen": true,
  "thresholds": { "auto": 0.85, "review": 0.5 }
}
```

命令行和环境变量优先于配置文件：`--shadow`、`--fail-open`、`DEBTGATE_SHADOW`、`DEBTGATE_FAIL_OPEN`。

作为库：

```ts
import { assessDiff } from "jev-debtgate";

const report = await assessDiff({
  cwd: process.cwd(),
  base: "origin/main",
  failOpen: true,
});
```

---

## 仓库里的例子

| 路径 | 用途 |
| --- | --- |
| `examples/god-file/src/kitchen-sink.ts` | HTTP、SQL、支付、队列挤在一个文件 |
| `examples/timeout-workaround` | 只加长测试 timeout，生产代码没动 |
| `examples/generated/api.gen.ts` | 生成物——不要当成拆分对象 |

```bash
npx jev-debtgate file examples/god-file/src/kitchen-sink.ts --collect-only --json
```

---

## 环境变量

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | （必填） | 你的 TypeSafe key |
| `JEV_MODEL` | `jev-latest` | 模型别名 |
| `DEBTGATE_AUTO` | `0.85` | 自动放行阈值 |
| `DEBTGATE_REVIEW` | `0.5` | 低于此值则复核 |
| `DEBTGATE_SHADOW` | 未设置 | 始终退出 0 |
| `DEBTGATE_FAIL_OPEN` | 未设置 | Jev 不可用时复核并退出 0 |
| `DEBTGATE_CWD` | 进程 cwd | MCP 工作树 |

```bash
npm test          # 单测 + 密钥扫描，不需要 API key
npm run live      # 可选的真实 Jev 检查，需要你的 key
```

如果提交了 TypeSafe 风格的密钥，`npm test` 会失败。

---

## 许可证

MIT
