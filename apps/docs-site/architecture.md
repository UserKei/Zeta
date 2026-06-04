# 系统架构

Zeta 当前采用轻量 pnpm workspace Monorepo。前端是一个 Vue Web 应用，内部包含管理端页面和独立 Chat 页面；后端是 NestJS 模块化单体，统一负责数据库、检索、模型调用和业务流程。

本页参考 C4 架构图的渐进表达方式：先用系统上下文图说明边界，再用分层架构图说明内部职责，最后用流程图说明关键动态链路。

## 系统上下文图

这张图只表达 Zeta 和外部世界的边界关系，不展开内部模块细节。

```mermaid
flowchart LR
    classDef actor fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#172033
    classDef system fill:#fff7d6,stroke:#d6a72f,stroke-width:2px,color:#172033
    classDef external fill:#eefcf6,stroke:#16a36a,stroke-width:2px,color:#172033
    classDef infra fill:#e7ecff,stroke:#4b63a8,stroke-width:2px,color:#172033

    user[浏览器用户]:::actor
    zeta[Zeta 主业务系统<br/>Vue Web + NestJS API]:::system
    database[(PostgreSQL<br/>业务数据 / tsvector / pgvector / Large Object)]:::infra
    modelApi[外部模型 API<br/>Chat / Embedding / Rerank / Vision]:::external
    evals[离线评测脚本<br/>Corpus Importer / Ragas / DeepEval]:::external
    docsSite[交付文档站<br/>VitePress / 静态报告]:::external

    user --> zeta
    zeta <--> database
    zeta <--> modelApi
    evals -.调用 API / 导入语料.-> zeta
    evals -.生成并发布报告.-> docsSite
```

## 分层架构图

这张图表达主业务系统内部的分层职责。箭头只表示上层依赖下层，不表示所有 service 调用。

```mermaid
flowchart TB
    classDef access fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#172033
    classDef presentation fill:#f0fdfa,stroke:#0f9f8f,stroke-width:2px,color:#172033
    classDef app fill:#fff7d6,stroke:#d6a72f,stroke-width:2px,color:#172033
    classDef domain fill:#f1e8ff,stroke:#7c5cd6,stroke-width:2px,color:#172033
    classDef infra fill:#e7ecff,stroke:#4b63a8,stroke-width:2px,color:#172033
    classDef item fill:#ffffff,stroke:#475569,stroke-width:1.5px,color:#172033

    subgraph accessLayer["接入层"]
      direction TB
      nginx[Nginx 反向代理<br/>静态资源托管 + /api 转发]
    end

    subgraph presentationLayer["表示层"]
      direction LR
      web[Vue Web<br/>管理端 + Chat 页面]
      api[NestJS API<br/>REST + SSE + JWT Guard]
    end

    subgraph appLayer["应用层"]
      direction LR
      subgraph userApp["用户与模型配置"]
        direction TB
        authModule[用户认证<br/>AuthModule]
        userModule[用户管理<br/>UserModule]
        modelsModule[模型管理<br/>ModelsModule]
      end
      subgraph knowledgeApp["知识库应用"]
        direction TB
        kbModule[知识库管理<br/>KnowledgeBasesModule]
        docsModule[文档管理<br/>KnowledgeDocsModule]
        filesModule[文件管理<br/>FilesModule]
      end
      subgraph agentApp["Agent 问答应用"]
        direction TB
        agentsModule[Agent 管理<br/>AgentsModule]
        chatModule[问答会话<br/>ChatModule]
      end
      userApp ~~~ knowledgeApp
      knowledgeApp ~~~ agentApp
    end

    subgraph domainLayer["领域能力层"]
      direction LR
      subgraph importDomain["文档入库服务"]
        direction TB
        fileParser[文件解析<br/>FileParserService]
        textSplitter[文本切分<br/>TextSplitterService]
        documentImport[文档导入<br/>DocumentImportService]
        documentAsset[资源处理<br/>DocumentAssetService]
        chunkIndexing[分段索引<br/>ChunkIndexingService]
      end
      subgraph ragDomain["RAG 运行时"]
        direction TB
        retrievalService[混合检索<br/>RetrievalService<br/>关键词检索 + 向量检索 + Rerank]
        chatService[问答编排<br/>ChatService<br/>消息/引用写入]
        aiExtracted[聊天标注入库<br/>AiExtractedDocumentService]
      end
      subgraph adapterDomain["模型适配服务"]
        direction TB
        chatAdapter[对话模型<br/>ChatModelService]
        embeddingAdapter[向量模型<br/>EmbeddingService]
        rerankAdapter[重排模型<br/>RerankService]
        visionAdapter[视觉理解<br/>ImageUnderstandingService]
      end
      importDomain ~~~ ragDomain
      ragDomain ~~~ adapterDomain
    end

    subgraph infraLayer["基础设施层"]
      direction LR
      subgraph storageInfra["数据与文件存储"]
        direction TB
        postgres[(PostgreSQL<br/>业务数据表<br/>文档元数据<br/>全文索引：tsvector + GIN<br/>向量索引：pgvector<br/>文件存储：Large Object)]
      end
      subgraph modelInfra["外部模型能力"]
        direction TB
        chatLLM[Chat LLM]
        embeddingModel[Embedding Model]
        rerankModel[Rerank Model]
        visionModel[Vision Model]
      end
      storageInfra ~~~ modelInfra
    end

    accessLayer --> presentationLayer --> appLayer --> domainLayer --> infraLayer

    class accessLayer,nginx access
    class presentationLayer,web,api presentation
    class appLayer,userApp,knowledgeApp,agentApp,authModule,userModule,modelsModule,kbModule,docsModule,filesModule,agentsModule,chatModule app
    class domainLayer,importDomain,ragDomain,adapterDomain,fileParser,textSplitter,documentImport,documentAsset,chunkIndexing,retrievalService,chatService,aiExtracted,chatAdapter,embeddingAdapter,rerankAdapter,visionAdapter domain
    class infraLayer,storageInfra,modelInfra,postgres,chatLLM,embeddingModel,rerankModel,visionModel infra
```

其中 `RetrievalService` 会合并关键词召回和向量召回；知识库配置 Reranker 后，再对候选分段进行精排。
`ChatModelService` 当前基于 LangChain.js `ChatOpenAI` 接入 OpenAI-compatible 对话模型。
应用层节点采用“功能名 + NestJS Module”，领域层节点采用“能力名 + Service”，方便中文汇报时先读职责，再对应到代码实现。
接入层只表达生产部署中的 Nginx 反向代理；表示层承接 Vue Web 页面和 NestJS 暴露的 REST/SSE API。
`AiExtractedDocumentService` 当前服务于聊天日志的改进标注入库：把人工确认的回答片段写成知识库分段并完成索引，不表示自动 AI 提炼流程已经落地。
`ParserModule` 是 NestJS 依赖注入模块，负责注册 `FileParserService`、各格式 Parser 和 `TextSplitterService`，因此没有作为运行时服务节点单独放进图里。
`Citation` 和 `ChatMessage` 是对话引用与消息记录，不是独立 Service；它们由 `ChatService` 写入 PostgreSQL，在流程图中用“保存消息和引用”表达。

## Agent 问答流程

```mermaid
flowchart LR
    question[用户发送问题]
    session[创建或读取 ChatSession]
    agent[读取 Agent 配置和绑定知识库]
    embed[问题向量化]
    retrieve[召回相关 Chunk]
    prompt[组装 Prompt 和引用上下文]
    adapter[对话模型适配器<br/>LangChain]
    llm[调用 Chat LLM]
    stream[SSE 流式返回回答]
    persist[保存消息和引用]
    source[展示引用来源]

    question --> session --> agent --> embed --> retrieve --> prompt --> adapter --> llm --> stream --> persist --> source
```

## 文档入库流程

```mermaid
flowchart LR
    upload[上传文档] --> preview[导入预览]
    preview --> parser[Parser / TextSplitter]
    parser --> chunks[Chunk 草稿]
    chunks --> confirm[确认入库]
    confirm --> indexing[ChunkIndexing]
    indexing --> fts[全文索引]
    indexing --> embedding[Embedding 向量]
    embedding --> indexed[Indexed Document]
```

## 离线评测流程

```mermaid
flowchart LR
    dataset[评测数据集] --> evalRunner[Ragas / DeepEval Runner]
    evalRunner --> api[调用 Zeta Chat API]
    api --> answer[回答 + 引用 + 命中上下文]
    answer --> metrics[计算 RAG 指标]
    metrics --> report[Markdown / CSV / HTML / JSON 报告]
    report --> site[VitePress 文档站]
```

## 架构取舍

- 不拆微服务：当前后端是 NestJS 模块化单体，便于本地开发、演示和部署。
- 不拆多个前端应用：管理端和 Chat 页面都在同一个 Vue 应用中，通过路由和 Layout 区分。
- 模型调用放在后端：前端不接触模型供应商密钥。
- RAG 可追溯：回答引用保存为结构化 Citation，可回溯到 Document 和 Chunk。
- Chat 生成层使用 LangChain.js：只把标准对话模型调用交给 LangChain，Embedding、Rerank、图片理解仍由 Zeta 的 model-adapters 管理。
