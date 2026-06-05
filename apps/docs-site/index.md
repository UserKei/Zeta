# Zeta

Zeta 是一个 AI 知识库管理平台，围绕知识生产、管理、检索、Agent 消费和知识反哺形成可演示闭环。

## 项目入口

- [Demo 演示](/demo)：查看当前可演示功能和页面入口。
- [快速开始](/quick-start)：启动本地基础设施、前端、后端和文档站。
- [系统架构](/architecture)：查看主系统分层和 RAG 主链路。
- [RAG 评测报告](/rag-evaluation)：查看 Ragas 与 DeepEval 的离线评测结果。

## 核心能力

- 知识生产：支持 Markdown、TXT、HTML、DOCX、PDF、CSV、Excel 等格式导入，并在入库前预览和调整分段。
- 混合检索：使用 PostgreSQL 全文检索、pgvector 向量检索和可选 Rerank 精排，提高召回和排序稳定性。
- Agent 消费：专家 Agent 基于绑定知识库回答问题，通过 SSE 流式输出并保存结构化引用。
- 知识反哺：对话日志可以标注回知识库，形成 AI 提炼文档和新分段，继续进入索引链路。

## 系统架构快照

![Zeta 分层架构图](/images/zeta-layered-architecture.png)

这张图按接入层、表示层、应用层、领域层和基础设施层整理当前系统边界。详细模块职责和关键链路见 [系统架构](/architecture)。
