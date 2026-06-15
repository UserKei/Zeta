#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"

if [ ! -f "$COMPOSE_FILE" ] || [ ! -f "package.json" ]; then
  echo "Please run this script from the Zeta repository root."
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Copy .env.production.example and fill production values first."
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  DOCKER="docker"
elif sudo docker compose version >/dev/null 2>&1; then
  DOCKER="sudo docker"
else
  echo "Docker Compose plugin is required."
  exit 1
fi

$DOCKER compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres
$DOCKER compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build api web ocr
$DOCKER compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm --no-deps api pnpm --dir server exec prisma migrate deploy
$DOCKER compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm --no-deps api pnpm --dir server exec prisma db seed
$DOCKER compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d redis ocr api web --remove-orphans
$DOCKER image prune -f --filter "until=24h"
$DOCKER compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
