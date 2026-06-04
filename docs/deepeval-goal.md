# DeepEval 接入 Goal

在已有评测相关分支上接入 DeepEval，不新建分支。DeepEval 作为离线评测工具放在 `evals/` 下，和 Ragas 一样黑盒调用已启动的 Zeta API，复用现有 dataset，生成本地 HTML/JSON 报告，并发布到 VitePress 文档站。

## 范围

- 新增 `evals/deepeval/run_deepeval.py`。
- 复用根目录 `.env`，默认使用 `DEEPSEEK_API_KEY` 和 `deepseek-v4-flash` 作为 judge。
- `evals/requirements.txt` 增加 `deepeval`。
- 根 `package.json` 增加：

```json
"eval:deepeval": "python3 -m evals.deepeval.run_deepeval"
```

- 输出报告：
  - `evals/reports/deepeval-report-<timestamp>.html`
  - `evals/reports/deepeval-report-<timestamp>.json`
- 更新 `evals/site_export.py`：
  - 读取 `evals/published-reports/deepeval/`
  - 复制 HTML 到 `apps/docs-site/public/eval-reports/deepeval/`
  - 在报告索引页展示 DeepEval 报告链接；没有报告时显示暂无报告。
- 更新 `apps/docs-site/rag-evaluation.md` 和 `evals/README.md`，说明 Ragas 与 DeepEval 的分工。

## 指标

第一版优先接 RAG 相关指标：

- Answer Relevancy
- Faithfulness
- Contextual Precision
- Contextual Recall

如果某些指标对当前字段或 DeepSeek judge 不稳定，可以先保留能稳定运行的指标，并在文档里写明取舍。

## 验证

```bash
evals/.venv/bin/python -m unittest discover evals/tests
pnpm docs:reports
pnpm docs:build
git diff --check
```

如果真实 DeepEval 运行受本地 API、模型 Key 或依赖限制阻塞，要说明原因；但导出脚本和文档站构建必须能通过。

## 提交建议

```bash
feat(evals): add DeepEval HTML report publishing
```
