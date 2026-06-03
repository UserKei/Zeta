# Evaluation Datasets

这里放 RAG 离线评测数据。第一版使用 JSONL，一行一个问题。

字段：

```json
{
  "id": "it-faq-001",
  "question": "VPN 权限多久生效？",
  "reference": "VPN 权限审批通过后通常 15 分钟内生效。",
  "expected_documents": ["IT 服务台 FAQ"],
  "knowledge_base_id": "可选，缺省时使用默认评测知识库",
  "agent_id": "可选，缺省时使用默认评测 Agent",
  "top_k": 5
}
```

约定：

- `question`：评测问题。
- `reference`：参考答案，用于 Ragas 的 context recall 等指标。
- `expected_documents`：期望命中的文档名称，用于脚本自己的命中文档统计。
- `knowledge_base_id` / `agent_id`：可以逐条覆盖默认知识库和 Agent。
- `top_k`：可以逐条覆盖默认召回数量。

不要提交真实生产对话、密钥或包含敏感信息的语料。
