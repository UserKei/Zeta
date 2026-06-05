# 快速开始

## 前置要求

- Node.js 24 或兼容版本。
- pnpm 10。
- Docker，用于启动本地 PostgreSQL + pgvector。
- Python 3，用于生成文档站评测报告和运行 Ragas / DeepEval。

## 安装依赖

```bash
cd Zeta
pnpm install
```

## 准备环境变量

```bash
cp .env.example .env
```

本地默认连接 Docker 中的 PostgreSQL：

```text
DATABASE_URL="postgresql://zeta@localhost:5432/zeta?schema=public"
```

如果需要使用 seed 默认模型、GitLab Handbook 语料导入或 Ragas 评测，需要在 `.env` 填写：

```text
DASHSCOPE_API_KEY="your-dashscope-key"
DEEPSEEK_API_KEY="your-deepseek-key"
```

真实 API Key、数据库密码和生产密钥不要提交到仓库。

## 启动基础设施

```bash
pnpm infra:up
```

本地基础设施使用 PostgreSQL 16 + pgvector。

## 初始化数据库

```bash
pnpm --filter @zeta/server exec prisma migrate dev
pnpm --filter @zeta/server exec prisma db seed
```

## 启动前后端

```bash
pnpm all
```

默认启动：

- Web：Vite 开发服务地址以终端输出为准。
- API：NestJS 开发服务地址以终端输出为准。

## 文档站命令

```bash
pnpm docs:reports
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
```

`docs:reports` 默认只发布 `evals/published-reports/` 中的基准报告，并生成 Ragas / DeepEval 详细报告页。如果只是本地诊断，可以显式混入本地临时报告：

```bash
pnpm docs:reports --include-local
```

## 评测环境

Ragas / DeepEval 评测需要单独安装 Python 依赖：

```bash
python3 -m venv evals/.venv
evals/.venv/bin/pip install -r evals/requirements.txt
```

评测脚本会调用已经启动的 Zeta 后端，并使用 `.env` 中的模型 Key。常用命令：

```bash
pnpm eval:ragas
pnpm eval:deepeval
```
