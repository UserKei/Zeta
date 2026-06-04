# Zeta RAG Evaluation

这里是 Zeta 的离线 RAG 测评小工程。脚本通过 HTTP 调用已经启动的 Zeta 后端，不把评测逻辑放进 NestJS 请求链路。

## 评测目标

- 检索是否召回了预期文档。
- Agent 回答是否为空。
- 回答是否带有引用。
- Ragas 指标是否能给出可复跑的质量基线。
- DeepEval 是否能生成更适合文档站展示的本地 HTML 报告。

Ragas 指标：

- `faithfulness`
- `answer_relevancy`
- `context_precision`
- `context_recall`

DeepEval 第一版同样关注 RAG 相关指标：

- `AnswerRelevancyMetric`
- `FaithfulnessMetric`
- `ContextualPrecisionMetric`
- `ContextualRecallMetric`

脚本还会额外统计：

- 成功 / 失败条数。
- 预期文档命中率。
- 平均召回上下文数量。
- 空回答数量。
- 空引用数量。

评测脚本是 Agent-centric：它调用 Agent Chat 接口，检索范围来自 Agent 已绑定的知识库，不单独绕过 Agent 指定知识库。

## 准备环境

1. 启动 Zeta 后端。

   ```bash
   pnpm server
   ```

2. 准备一个已经导入文档的知识库，并创建绑定该知识库的 Agent。

3. 创建 Python 虚拟环境并安装依赖。建议使用 Python 3.11 或 3.12。

   ```bash
   python3 -m venv evals/.venv
   source evals/.venv/bin/activate
   pip install -r evals/requirements.txt
   ```

4. 在仓库根目录 `.env` 填写评测变量。

   项目只使用根目录 `.env`，评测脚本不会再读取 `evals/.env`。

   ```env
   ZETA_USERNAME=admin
   ZETA_PASSWORD=123456
   DASHSCOPE_API_KEY=<dashscope-api-key>
   DEEPSEEK_API_KEY=<deepseek-api-key>
   ```

   默认情况下，评测脚本连接 `http://localhost:3000`，按名称查找 `GitLab Handbook Expert`，Ragas 的 LLM-as-a-Judge 使用 DeepSeek `deepseek-v4-flash`，Embedding 评测使用 DashScope `text-embedding-v4`。如果需要自定义运行，可以设置 `ZETA_API_BASE_URL`、`ZETA_EVAL_AGENT_NAME`、`ZETA_EVAL_TOP_K`、`ZETA_EVAL_REPORT_DIR`、`ZETA_EVAL_JUDGE_*` 或 `ZETA_EVAL_EMBEDDING_*`；这些变量都有默认值，不放在 `.env.example`。

## 准备数据集

默认数据集路径：

```text
evals/datasets/gitlab-handbook.sample.jsonl
```

格式见 [datasets/README.md](datasets/README.md)。

示例：

```json
{
  "id": "it-faq-001",
  "question": "VPN 权限多久生效？",
  "reference": "VPN 权限审批通过后通常 15 分钟内生效。",
  "expected_documents": ["IT 服务台 FAQ"],
  "top_k": 5
}
```

## GitLab Handbook 评测语料

可以先用 GitLab Handbook 跑通大规模 Markdown 语料评测流程：

```bash
CORPUS_LIMIT=20 pnpm import:markdown-corpus
```

导入脚本会自动 clone / pull 到 `example/corpora/gitlab-handbook/`，并创建或复用默认评测资源：Chat 模型、Embedding 模型、Reranker 模型、知识库和 Agent。评测脚本默认会按名称查找 `GitLab Handbook Expert` 这个 Agent，不需要手动填写 UUID。

```bash
pnpm eval:ragas --dataset evals/datasets/gitlab-handbook.sample.jsonl
```

## 运行评测

```bash
pnpm eval:ragas
```

运行 DeepEval：

```bash
pnpm eval:deepeval
```

也可以手动指定参数：

```bash
python3 -m evals.ragas.run_ragas \
  --dataset evals/datasets/zeta-demo.jsonl \
  --agent-id <agent-id> \
  --top-k 5
```

如果 Ragas 打分失败，脚本仍会写出基础报告，但默认以非 0 状态退出，避免 CI 或手工评测误判为成功。需要临时降级时，可以加 `--allow-ragas-failure` 或设置 `ZETA_EVAL_ALLOW_RAGAS_FAILURE=true`。

输出：

- `evals/reports/ragas-report-<timestamp>.md`
- `evals/reports/ragas-report-<timestamp>.csv`
- `evals/reports/deepeval-report-<timestamp>.html`
- `evals/reports/deepeval-report-<timestamp>.json`

Markdown 报告会包含本次运行的元信息，例如 Agent、绑定知识库、数据集路径、topK、Judge 模型、Embedding 评测模型、rerank 是否启用、当前代码 commit 和语料来源 ref。这样后续比较报告时，可以先确认两次评测是不是在相同条件下运行。

DeepEval 默认也使用 `DEEPSEEK_API_KEY` 和 `deepseek-v4-flash` 作为 judge。它复用同一份数据集和同一个 Agent Chat 调用结果，但输出重点是本地 HTML/JSON 报告，方便挂到文档站或 GitHub Pages。

默认会读取 `evals/baselines/gitlab-handbook.json`，在报告中展示当前指标和 baseline 的差值。这个 baseline 只用于人工对比，不作为 CI 门禁。需要跳过或替换时可以设置：

```bash
pnpm eval:ragas --baseline ""
pnpm eval:ragas --baseline evals/baselines/other.json
```

## 发布到交付文档站

文档站构建前可以运行：

```bash
pnpm docs:reports
```

这个命令会把 `evals/reports/` 中的 Ragas Markdown / CSV 复制到 `apps/docs-site/public/eval-reports/ragas/`，也会把 DeepEval HTML / JSON 复制到 `apps/docs-site/public/eval-reports/deepeval/`，并生成：

- `apps/docs-site/eval-reports/index.md`
- `apps/docs-site/eval-reports/latest.md`

如果要随仓库发布一份 DeepEval 基准报告，把确认过的 HTML / JSON 放到 `evals/published-reports/deepeval/`，再运行 `pnpm docs:reports` 即可。

## 取舍

- 第一版只做离线评测，不做线上 dashboard。
- Ragas 用于稳定的 Markdown / CSV 指标基线。
- DeepEval 用于生成本地 HTML / JSON 报告，方便文档站展示。
- 评测脚本黑盒调用 Zeta API，不修改业务接口。
- 评测数据由人工维护，避免用 mock 数据冒充真实效果。
