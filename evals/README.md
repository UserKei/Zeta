# Zeta RAG Evaluation

这里是 Zeta 的离线 RAG 测评小工程。第一版只接入 Ragas，通过 HTTP 调用已经启动的 Zeta 后端，不把评测逻辑放进 NestJS 请求链路。

## 评测目标

- 检索是否召回了预期文档。
- Agent 回答是否为空。
- 回答是否带有引用。
- Ragas 指标是否能给出可复跑的质量基线。

第一版指标：

- `faithfulness`
- `answer_relevancy`
- `context_precision`
- `context_recall`

脚本还会额外统计：

- 成功 / 失败条数。
- 预期文档命中率。
- 平均召回上下文数量。
- 空回答数量。
- 空引用数量。

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
   ZETA_API_BASE_URL=http://localhost:3000
   ZETA_USERNAME=admin
   ZETA_PASSWORD=123456
   ZETA_EVAL_KNOWLEDGE_BASE_NAME=GitLab Handbook
   ZETA_EVAL_AGENT_NAME=GitLab Handbook Expert
   DASHSCOPE_API_KEY=<dashscope-api-key>
   DEEPSEEK_API_KEY=<deepseek-api-key>
   OPENAI_API_KEY=<judge-model-api-key>
   ```

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

导入脚本会自动 clone / pull 到 `example/corpora/gitlab-handbook/`，并创建或复用默认评测资源：Chat 模型、Embedding 模型、知识库和 Agent。评测脚本默认会按名称查找 `GitLab Handbook` 和 `GitLab Handbook Expert`，不需要手动填写 UUID。

```bash
pnpm eval:ragas --dataset evals/datasets/gitlab-handbook.sample.jsonl
```

## 运行评测

```bash
pnpm eval:ragas
```

也可以手动指定参数：

```bash
python3 -m evals.ragas.run_ragas \
  --dataset evals/datasets/zeta-demo.jsonl \
  --knowledge-base-id <knowledge-base-id> \
  --agent-id <agent-id> \
  --top-k 5
```

输出：

- `evals/reports/ragas-report-<timestamp>.md`
- `evals/reports/ragas-report-<timestamp>.csv`

## 取舍

- 第一版只做离线评测，不做线上 dashboard。
- 第一版只接 Ragas，不同时引入 DeepEval。
- 评测脚本黑盒调用 Zeta API，不修改业务接口。
- 评测数据由人工维护，避免用 mock 数据冒充真实效果。
