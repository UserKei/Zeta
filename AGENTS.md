# AGENTS.md

## 项目定位

Zeta 是一个 AI 知识库管理平台，首版围绕这条基础闭环开发：

- 配置模型能力，如对话模型、Embedding 模型、Reranker。
- 创建知识库，管理文档、分块、索引和检索结果。
- 创建专家 Agent，让 Agent 基于绑定知识库回答问题并给出引用。

当前项目处于早期阶段，优先把主链路做清楚，不为暂未落地的能力提前搭框架。

## 规则入口

- 写实现代码前先参考 `docs/rules/implementation-style.md`。
- 涉及重构、抽象取舍、函数拆分、目录调整或删除中间层时，参考 `docs/rules/refactor-style.md`。
- 本文件负责项目级边界和工程约定；代码可读性、抽象取舍以规则文档为准。
- 如果项目约定和通用工程习惯冲突，优先遵守本项目已有约定。

## 技术栈与目录

- 仓库使用 pnpm workspace。
- `apps/web/` 是 Vue 前端，负责页面、交互状态和调用后端 API。
- `server/` 是 NestJS 后端，负责业务流程、接口、模型调用、文件处理、检索和数据库写入。
- `server/prisma/` 存放 Prisma schema 与迁移相关文件。Prisma 只属于后端，不要让前端直接依赖数据库模型。
- `server/libs/` 用于后端内部共享代码。只有存在稳定复用和清晰边界时才继续扩展共享库。
- `packages/` 预留给真正需要被多个 workspace 复用的包，不要为了形式完整先建空包。
- `docker-compose.infra.yml` 是本地基础设施入口。
- `docker-infra/` 存放基础设施初始化脚本和配置资源，不放业务代码。

## 架构边界

- 前端不直接访问 PostgreSQL、Prisma、文件 Large Object 或模型供应商密钥。
- NestJS API 是前端访问业务能力的边界；页面层不要复制后端业务规则。
- PostgreSQL 是首版业务数据与文件元数据的持久化落点。
- 文档原文件首版参考 PostgreSQL Large Object 方案处理，表中保存文件元数据和 Large Object 指针。
- Chunk 是检索与引用的最小知识单元。
- Chunk 的全文检索设计落在 PostgreSQL `tsvector`/GIN 侧，语义检索落在 `pgvector` 侧；后端检索流程决定关键词召回、向量召回或混合召回。
- 知识库本身就是首版一级分类，不要提前新增标签、目录树、分类体系或多套知识归属模型。
- Agent 通过绑定知识库消费知识。聊天回答中的引用关系要能回溯到命中的 Chunk 和 Document。

## 领域落点

新增功能时优先沿用这些概念：

- `Model`：模型配置与能力类型。
- `KnowledgeBase`：知识组织单位和首版一级分类。
- `Document`：知识库中的管理条目，承载来源、解析和入库状态。
- `File`：上传源文件的元数据和文件存储指针。
- `Chunk`：可检索、可引用的知识分块。
- `Embedding`：Chunk 的向量表示。
- `Agent`：绑定模型与知识库的问答角色。
- `ChatSession`、`ChatMessage`、`Citation`：对话记录和引用证据。

新增概念前先判断它是否表达新的稳定业务事实。不要把一次性的接口入参、页面展示结构或临时处理状态升级成长期领域模型。

## 数据与配置约定

- 数据库结构以 Prisma schema 和迁移为实现落点；设计讨论产物需要落库时，要同步到后端数据库定义。
- 使用 PostgreSQL 特性时要显式处理边界，例如 `pgvector`、全文检索字段、索引和 Large Object 生命周期。
- 模型 API Key、数据库连接串和部署差异放在环境变量，不要写进源码。
- 本地基础设施示例值可放 `.env.example`，真实 `.env` 不提交。
- 当前 `docker-compose.infra.yml` 的 PostgreSQL 配置是本地开发用途；无密码 `trust` 配置不能直接用于生产部署。

## 开发取舍

- 先完成模型、知识库、文档入库、检索、Agent 问答这条主链路。
- 自动提炼闭环、多模态专用能力、复杂权限、统计、通用工具编排等能力未进入首版时，不要提前建完整表结构和模块体系。
- 少量重复可以接受；只有稳定复用、隔离外部复杂度或保护业务边界时才增加抽象。
- 避免在内部契约清楚的地方叠加宽松 fallback 和隐式兼容逻辑。输入语义不清时先修正契约。
- 修改范围聚焦当前需求，避免顺手改动无关模块、生成文件或目录布局。

## 常见修改检查

新增知识库或文档能力时：

- 明确数据属于 KnowledgeBase、Document、File 还是 Chunk。
- 明确文档状态变化、原文件处理、分块生成和索引写入顺序。
- 明确失败后哪些状态需要保留，哪些写入不能悄悄丢失。

新增检索能力时：

- 明确检索输入、召回来源、排序策略和引用证据。
- 不要把展示摘要当成原始可引用内容。
- 保持命中结果能回溯到 Chunk、Document 和 KnowledgeBase。

新增 Agent 或聊天能力时：

- 明确模型配置、知识库绑定、提示词输入和引用输出。
- 区分用户消息、模型回答和引用证据，不把它们混成一份不可追踪文本。
- 模型调用细节留在后端，不泄露密钥到前端。

## 验证命令

按改动范围选择验证命令。

前端：

```bash
pnpm --filter web lint
pnpm --filter web build
```

后端：

```bash
pnpm --filter server lint
pnpm --filter server build
pnpm --filter server test
```

本地基础设施：

```bash
pnpm infra:up
pnpm infra:ps
```

如果某个检查当前无法执行，要在最终说明中写明原因。
