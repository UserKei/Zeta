# Docker 基础设施

`docker-infra` 用来存放 Zeta 基础设施相关的初始化脚本和配置资源。
Compose 入口文件放在仓库根目录的 `docker-compose.infra.yml`。

## PostgreSQL

本地数据库使用带有 `pgvector` 的 PostgreSQL 16 镜像。
数据库首次初始化时会执行 `postgres/init/001-extensions.sql`，
提前启用知识分块向量检索需要的 `vector` 扩展。

在 Zeta 仓库根目录执行：

```bash
pnpm infra:up
```

默认本地连接串：

```env
DATABASE_URL="postgresql://zeta@localhost:5432/zeta?schema=public"
```

当 Prisma 需要连接 Docker 中的 PostgreSQL 时，把它配置到仓库根目录 `.env`。

当前配置只用于本地开发，PostgreSQL 使用 `trust` 认证，不设置密码。
后续部署到服务器时不要直接复用这套无密码配置。

如果要修改本地数据库名、用户名或宿主机端口，
先把仓库根目录 `.env.example` 复制为 `.env`，
再在首次初始化容器前修改 `POSTGRES_DB`、`POSTGRES_USER` 或 `POSTGRES_PORT`。
`pnpm infra:*` 命令会优先读取根目录 `.env`；没有 `.env` 时使用 Compose 默认值。

```bash
cp .env.example .env
pnpm infra:up
```

常用命令：

```bash
pnpm infra:ps
pnpm infra:logs
pnpm infra:down
```

`zeta-postgres-data` Docker 数据卷用于持久化数据库数据。
PostgreSQL 初始化脚本只会在这个数据卷首次创建时执行。
