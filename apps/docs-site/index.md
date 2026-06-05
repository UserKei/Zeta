# Zeta

Zeta 是一个 AI 知识库管理平台，用来演示文档导入、分段索引、检索测试、Agent 引用回答和对话标注入库。

## 项目入口

- [Demo 演示](/demo)：查看本地演示步骤和页面入口。
- [快速开始](/quick-start)：启动本地基础设施、前端、后端和文档站。
- [系统架构](/architecture)：查看主系统分层和 RAG 运行流程。
- [RAG 评测报告](/rag-evaluation)：查看 Ragas 与 DeepEval 的离线评测结果。

## 交付内容

- 文档导入：支持 Markdown、TXT、HTML、DOCX、PDF、CSV、Excel，入库前可以预览和编辑分段。
- 检索链路：PostgreSQL 负责全文检索，pgvector 负责向量检索，知识库可以选择 Rerank 模型做精排。
- Agent 问答：专家 Agent 绑定知识库后回答问题，通过 SSE 返回内容，并保存 Citation 引用。
- 标注入库：管理员可以把对话日志中的有用回答写回知识库，生成新的文档和分段。

## 系统架构快照

![Zeta 分层架构图](/images/zeta-layered-architecture.png)

这张图按接入层、表示层、应用层、领域层和基础设施层整理系统边界。模块职责和运行流程见 [系统架构](/architecture)。
