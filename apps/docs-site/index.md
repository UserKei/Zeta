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

## 系统架构快照

![Zeta 分层架构图](/images/zeta-layered-architecture.png)

这张图按接入层、表示层、应用层、领域层和基础设施层整理当前系统边界。详细模块职责和关键链路见 [系统架构](/architecture)。
