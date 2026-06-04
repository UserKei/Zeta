# RAG 评测报告

Zeta 的 RAG 评测是离线流程：Python 脚本通过 HTTP 调用已经启动的 Zeta 后端，拿到 Agent 回答、检索上下文和引用信息，再交给 Ragas 打分。

评测逻辑不放进 NestJS 请求链路，也不作为生产监控的一部分。

## 评测目标

- 检索是否召回预期文档。
- Agent 回答是否为空。
- 回答是否带有引用。
- Ragas 指标是否能形成可复跑的质量基线。

当前指标：

- `answer_relevancy`
- `context_precision`
- `context_recall`
- `faithfulness`

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

默认数据集：

```text
evals/datasets/gitlab-handbook.sample.jsonl
```

输出：

```text
evals/reports/ragas-report-<timestamp>.md
evals/reports/ragas-report-<timestamp>.csv
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

这份报告会随文档站一起发布，报告索引页中也会保留 Markdown 和 CSV 原始报告链接。

## 文档站报告

构建文档站前先导出报告索引：

```bash
pnpm docs:reports
```

这个命令会：

1. 读取 `evals/reports/` 中的 Ragas Markdown / CSV。
2. 同时读取 `evals/published-reports/ragas/` 中随仓库提交的发布版 Ragas 报告。
3. 把原始报告复制到 `apps/docs-site/public/eval-reports/ragas/`。
4. 生成 [评测报告索引](/eval-reports/)。
5. 生成 [最新 Ragas 报告](/eval-reports/latest)。
6. 预留 `apps/docs-site/public/eval-reports/deepeval/`，后续可直接挂载 DeepEval HTML 报告。

## DeepEval 预留方式

DeepEval 当前还没有接入，所以文档站里不会展示 DeepEval 分数。后续如果接入，可以把 HTML 报告复制到：

```text
apps/docs-site/public/eval-reports/deepeval/
```

然后在报告索引页补充链接即可。当前不接 Confident AI 云平台，也不做线上 dashboard。
