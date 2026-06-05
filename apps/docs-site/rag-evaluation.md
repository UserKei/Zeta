# RAG 评测报告

Zeta 的 RAG 评测是离线流程：Python 脚本通过 HTTP 调用已经启动的 Zeta 后端，拿到 Agent 回答、检索上下文和引用信息，再交给 Ragas 或 DeepEval 打分。

评测逻辑不放进 NestJS 请求链路，也不作为生产监控的一部分。

## 评测目标

- 检索是否召回预期文档。
- Agent 回答是否为空。
- 回答是否带有引用。
- Ragas 指标是否能形成可复跑的质量基线。
- DeepEval 是否能生成适合交付文档站展示的本地 Markdown 报告。

当前 Ragas 指标：

- `answer_relevancy`
- `context_precision`
- `context_recall`
- `faithfulness`

当前 DeepEval 指标：

- `AnswerRelevancyMetric`
- `FaithfulnessMetric`
- `ContextualPrecisionMetric`
- `ContextualRecallMetric`

脚本还会额外统计：

- 成功 / 失败条数。
- 预期文档命中率。
- 平均召回上下文数量。
- 平均唯一召回文档数。
- 空回答数量。
- 空引用数量。

## 运行评测

```bash
pnpm eval:ragas
```

DeepEval 复用同一份数据集和 Agent Chat 调用链路：

```bash
pnpm eval:deepeval
```

默认数据集：

```text
evals/datasets/gitlab-handbook.sample.jsonl
```

输出：

```text
evals/reports/ragas-report-<timestamp>.md
evals/reports/ragas-report-<timestamp>.csv
evals/reports/deepeval-report-<timestamp>.json
```

## 当前 Ragas 结果

当前发布到文档站的基准报告来自 `ragas-report-20260604-141149`，数据集为 GitLab Handbook 样例集，共 30 条用例。

| 指标                       |   数值 |
| -------------------------- | -----: |
| answer_relevancy           | 0.9178 |
| context_precision          | 0.7311 |
| context_recall             | 0.8667 |
| faithfulness               | 0.9274 |
| Expected document hit rate | 0.9667 |
| Average context count      |   5.00 |
| Empty answers              |      0 |
| Empty citations            |      0 |

这份报告会随文档站一起发布，评测报告页中也会保留 Markdown 和 CSV 原始报告链接。

## 文档站报告

构建文档站前先导出评测报告：

```bash
pnpm docs:reports
```

这个命令默认只发布 `evals/published-reports/` 中的基准报告，避免把本地临时测试结果混进交付文档。它会：

1. 读取 `evals/published-reports/ragas/` 中随仓库提交的发布版 Ragas 报告。
2. 读取 `evals/published-reports/deepeval/` 中随仓库提交的发布版 DeepEval JSON。
3. 把原始 Ragas Markdown / CSV 复制到 `apps/docs-site/public/eval-reports/ragas/`。
4. 生成 [评测报告](/eval-reports/)。
5. 生成 [最新 Ragas 报告](/eval-reports/latest)。
6. 读取 DeepEval JSON 报告，生成 VitePress Markdown 页面，并复制原始 JSON 到 `apps/docs-site/public/eval-reports/deepeval/`。

如果需要在本地预览未发布的临时报告，可以显式执行：

```bash
pnpm docs:reports --include-local
```

## DeepEval 报告方式

DeepEval 走本地 JSON + Markdown 报告，不接 Confident AI 云 dashboard。确认要随文档站发布的报告可以放到：

```text
evals/published-reports/deepeval/
```

然后运行 `pnpm docs:reports`。脚本会把原始 JSON 复制到文档站 public 目录，并生成可直接浏览的 Markdown 报告页。
