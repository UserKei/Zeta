---
layout: home

hero:
  name: Zeta
  text: AI 知识库管理平台
  tagline: 围绕知识生产、管理、检索、Agent 消费和知识反哺形成可演示闭环。
  actions:
    - theme: brand
      text: 查看 Demo
      link: /demo
    - theme: alt
      text: 快速开始
      link: /quick-start

features:
  - title: 知识生产
    details: 支持 Markdown、TXT、HTML、DOCX、PDF、CSV、Excel 等格式导入，并在入库前预览和调整分段。
  - title: 混合检索
    details: 使用 PostgreSQL 全文检索、pgvector 向量检索和可选 Rerank 精排，提高召回和排序稳定性。
  - title: Agent 消费
    details: 专家 Agent 基于绑定知识库回答问题，通过 SSE 流式输出并保存结构化引用。
  - title: 知识反哺
    details: 对话日志可以标注回知识库，形成 AI 提炼文档和新分段，继续进入索引链路。
---

## 主链路

```mermaid
flowchart LR
  A[模型配置] --> B[知识库]
  B --> C[文档导入与分段]
  C --> D[全文索引与向量索引]
  D --> E[检索测试]
  E --> F[专家 Agent]
  F --> G[流式问答与引用]
  G --> H[对话日志标注入库]
  G --> I[知识热度统计]
  H --> C
```

Zeta 当前不是一个通用工作流平台，而是优先把“企业知识进入系统、被检索、被 Agent 消费、再被沉淀回知识库”这条路径做完整。

## 系统架构快照

![Zeta 分层架构图](/images/zeta-layered-architecture.png)

这张图按接入层、表示层、应用层、领域层和基础设施层整理当前系统边界。详细模块职责和关键链路见 [系统架构](/architecture)。

## 评测报告

当前文档站已发布离线 RAG 评测结果，包含 Ragas 指标和 DeepEval 本地 Markdown 报告。

- [最新 Ragas 报告](/eval-reports/latest)：展示当前基准数据集的召回、相关性、忠实度和诊断结果。
- [评测报告](/eval-reports/)：汇总最新 Ragas / DeepEval 指标，并保留历史报告、CSV 明细和 DeepEval JSON 原始数据。
- [RAG 评测说明](/rag-evaluation)：说明评测脚本、数据集、指标和报告发布方式。

## 交付入口

- [Demo 演示](/demo)：适合汇报时按步骤演示。
- [系统架构](/architecture)：说明前端、后端、模型适配、数据库和检索边界。
- [文件解析链路](/file-parsing)：说明多格式文档如何进入统一 Chunk 流程。
- [RAG 评测报告](/rag-evaluation)：说明离线 Ragas 评测、报告产物和当前边界。
