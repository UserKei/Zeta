# RAG 评测

Zeta 的 RAG 评测是离线流程：脚本调用已经启动的 Zeta Chat API，拿到 Agent 回答、检索上下文和引用信息，再交给 Ragas / DeepEval 打分。完整执行链路见 [系统架构里的离线评测流程](/architecture#离线评测流程)。

## 当前评测结果

当前发布版基准数据来自 GitLab Handbook 样例集，共 30 条问答用例。

| 工具     | 用例结果 | answer_relevancy | context_precision | context_recall | faithfulness | 详情                                      |
| -------- | -------: | ---------------: | ----------------: | -------------: | -----------: | ----------------------------------------- |
| Ragas    |    30/30 |           0.9178 |            0.7311 |         0.8667 |       0.9274 | [最新报告](/eval-reports/ragas/latest)    |
| DeepEval |    21/30 |           0.8441 |            0.7678 |         0.9000 |       0.9381 | [最新报告](/eval-reports/deepeval/latest) |

这组指标主要用于观察回答相关性、上下文精确率、上下文召回率和回答忠实度。详细 Markdown / CSV / JSON 报告可以从上表进入。

## 测试用例

数据集文件是 `evals/datasets/gitlab-handbook.sample.jsonl`。每条用例包含问题、参考答案、预期命中文档和 `topK`。

| 用例                                    | 问题                                                                                                  | 考察点         | 预期文档                                                                                                                                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gitlab-handbook-introduction`          | What is the GitLab team handbook used for?                                                            | 基础事实问答   | [content/handbook/\_index.md](https://gitlab.com/gitlab-com/content-sites/handbook/-/blob/main/content/handbook/_index.md)                                                                                                                |
| `gitlab-handbook-escalation`            | Which handbook issues should only be escalated?                                                       | 精确文档召回   | [content/handbook/about/escalation.md](https://gitlab.com/gitlab-com/content-sites/handbook/-/blob/main/content/handbook/about/escalation.md)                                                                                             |
| `gitlab-infrastructure-reference-links` | What kind of information is collected in the Business Technology infrastructure reference links page? | 长路径文档召回 | [content/handbook/business-technology/engineering/infrastructure/reference-links.md](https://gitlab.com/gitlab-com/content-sites/handbook/-/blob/main/content/handbook/business-technology/engineering/infrastructure/reference-links.md) |

## 如何运行

```bash
pnpm eval:ragas
pnpm eval:deepeval
pnpm docs:reports
```

`pnpm docs:reports` 默认只发布 `evals/published-reports/` 中确认过的基准报告，避免把本地临时测试结果混进交付文档。
