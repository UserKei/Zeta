ARG NODE_BASE_IMAGE=node:24-bookworm-slim

FROM ${NODE_BASE_IMAGE} AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV HUSKY=0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/common/package.json ./packages/common/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY server/package.json ./server/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY . .

ENV DATABASE_URL=postgresql://zeta:zeta@postgres:5432/zeta?schema=public
ENV VITE_API_BASE_URL=/api

RUN pnpm --filter @zeta/server exec prisma generate
RUN pnpm --filter @zeta/server build
RUN pnpm --filter @zeta/web build

FROM base AS api

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app /app

EXPOSE 3000

CMD ["node", "server/dist/src/main.js"]

FROM nginx:1.27-alpine AS web

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
