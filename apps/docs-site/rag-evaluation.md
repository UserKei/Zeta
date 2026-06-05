# RAG 评测

Zeta 的 RAG 评测由离线脚本执行：脚本调用已经启动的 Zeta Chat API，收集 Agent 回答、检索上下文和引用信息，再交给 Ragas / DeepEval 打分。执行链路见 [系统架构里的离线评测流程](/architecture#离线评测流程)。

## 当前评测结果

发布版基准数据来自 GitLab Handbook 样例集，共 100 条问答用例。

| 工具     | 用例结果 | answer_relevancy | context_precision | context_recall | faithfulness | 详情                                      |
| -------- | -------: | ---------------: | ----------------: | -------------: | -----------: | ----------------------------------------- |
| Ragas    |  100/100 |           0.8006 |            0.8328 |         0.9400 |       0.9614 | [最新报告](/eval-reports/ragas/latest)    |
| DeepEval |   82/100 |           0.8701 |            0.8470 |         0.9550 |       0.9614 | [最新报告](/eval-reports/deepeval/latest) |

这组指标用于观察回答相关性、上下文精确率、上下文召回率和回答忠实度。Markdown / CSV / JSON 详情从上表进入。

## 测试用例

数据集文件是 `evals/datasets/gitlab-handbook.sample.jsonl`。每条用例包含问题、参考答案、预期命中文档和 `topK`。

| 用例                                    | 问题                                                                                                  | 考察点         | 预期文档                                                                                                                                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gitlab-handbook-introduction`          | What is the GitLab team handbook used for?                                                            | 基础事实问答   | [content/handbook/\_index.md](https://gitlab.com/gitlab-com/content-sites/handbook/-/blob/main/content/handbook/_index.md)                                                                                                                |
| `gitlab-handbook-escalation`            | Which handbook issues should only be escalated?                                                       | 精确文档召回   | [content/handbook/about/escalation.md](https://gitlab.com/gitlab-com/content-sites/handbook/-/blob/main/content/handbook/about/escalation.md)                                                                                             |
| `gitlab-infrastructure-reference-links` | What kind of information is collected in the Business Technology infrastructure reference links page? | 长路径文档召回 | [content/handbook/business-technology/engineering/infrastructure/reference-links.md](https://gitlab.com/gitlab-com/content-sites/handbook/-/blob/main/content/handbook/business-technology/engineering/infrastructure/reference-links.md) |

## 如何运行

```bash
pnpm eval:setup
pnpm eval:ragas
pnpm eval:deepeval
pnpm docs:reports
```

首次运行评测前先执行 `pnpm eval:setup`，它会创建 `evals/.venv` 并安装 `evals/requirements.txt`。后续只有依赖变更时才需要重新执行。

`pnpm docs:reports` 默认只发布 `evals/published-reports/` 中确认过的基准报告，避免把本地临时测试结果混进交付文档。
