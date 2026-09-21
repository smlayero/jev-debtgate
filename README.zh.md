# jev-debtgate

[English](README.md) · 中文

这是一面给**技术债**用的闸门。

写代码的 Agent 很快。它们也很容易留下加长的 timeout、拼出来的 SQL、以及往已经过重的文件里再塞一个函数。**jev-debtgate** 就是为了不让这些被叫成「清理」或「还债」。

它看一次 diff 或一个文件，回答流程里真正要拍板的问题：

- 这次是在还债，还是在欠新债？
- 这是根因修复，还是把症状藏起来的 workaround？
- 这个文件是职责堆在一起、是生成物，还是可以先不动？
- 接下来若还要改，用便宜模型就够，还是该换成更强的？

结论只有 `allow`、`review`、`block`。不会凭第一名选项自动合入。

---

## 它怎么判断

1. **事实留在本地。** 行数、import 种类、git churn，以及跳过测试、SQL 拼接这类模式，都在你的机器上采集。不会把整仓上传。
2. **判断交给 [TypeSafe Jev](https://typesafe.ai)。** Jev 是决策模型：提交 state 和类型化问题，返回概率，而不是一段 review 长文。
3. **闸门策略由我们写死。** 高置信度的 workaround 直接拦截。生成文件不当成「拆文件还债」。关键问题说不准时，结果是 `review`，不会自动重构。

请使用 `verdict.action` 和 `confidence_floor`，不要只看 `choice` 的第一名。

---

## 安装

使用**你自己的** TypeSafe API Key。本仓库不附带密钥。

```bash
git clone https://github.com/smlayero/jev-debtgate.git
cd jev-debtgate
npm install
npm run build
cp .env.example .env    # 从 https://console.typesafe.ai 粘贴你的 key
npx jev-debtgate doctor
```

不要提交 `.env` 或 `.cursor/mcp.json`。命令行也可以用 `debtgate`。

---

## 命令

```bash
npx jev-debtgate diff                     # 相对 HEAD 的未提交改动
npx jev-debtgate diff --base origin/main --json
npx jev-debtgate gate                     # 假修复 / workaround 闸门
npx jev-debtgate file src/app.ts          # 上帝文件 / 职责是否过于集中
npx jev-debtgate file src/app.ts --collect-only
npx jev-debtgate init
npx jev-debtgate doctor
```

| 退出码 | 含义 |
| --- | --- |
| `0` | 放行 |
| `1` | 复核 |
| `2` | 拦截 |
| `3` | 错误（缺 key、不是 git 仓库等） |

`--collect-only` 只跑本地采集，不调用 Jev，那是度量，不是裁定。

---

## 在 Cursor 里用

1. `npm run build`
2. 复制 `.cursor/mcp.json.example` 为 `.cursor/mcp.json`
3. 在 `env.TYPESAFE_API_KEY` 填入**你的** key
4. 把 `args` 指到本仓的 `dist/mcp.js`

| 工具 | 何时调用 |
| --- | --- |
| `debt_assess_diff` | 宣称重构完成，或准备开 PR 之前 |
| `debt_workaround_gate` | 测试刚因一个很小的改动变绿时 |
| `debt_assess_file` | 模块代码堆在一个文件里，或准备拆文件时 |

`.cursor/skills/debtgate/SKILL.md` 会要求 Agent 遵守闸门结果。

---

## 在 GitHub Actions 里用

传入**你自己的**仓库 Secret。`api-key` 为空时任务失败。

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
| `DEBTGATE_CWD` | 进程 cwd | MCP 工作树 |

```bash
npm test          # 单测 + 密钥扫描，不需要 API key
npm run live      # 可选的真实 Jev 检查，需要你的 key
```

如果提交了 TypeSafe 风格的密钥，`npm test` 会失败。

---

## 许可证

MIT
