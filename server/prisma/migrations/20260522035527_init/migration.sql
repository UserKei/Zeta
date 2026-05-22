-- Enable pgvector before creating vector columns.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "ai_model_type" AS ENUM ('CHAT', 'EMBEDDING', 'RERANKER');

-- CreateEnum
CREATE TYPE "knowledge_base_status" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "file_status" AS ENUM ('UPLOADED', 'AVAILABLE', 'FAILED');

-- CreateEnum
CREATE TYPE "document_source_type" AS ENUM ('FILE_UPLOAD', 'MANUAL', 'AI_EXTRACTED', 'WEB_IMPORT');

-- CreateEnum
CREATE TYPE "document_status" AS ENUM ('UPLOADED', 'PARSING', 'CHUNKING', 'EMBEDDING', 'INDEXED', 'FAILED', 'DISABLED');

-- CreateEnum
CREATE TYPE "chunk_status" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "agent_status" AS ENUM ('DRAFT', 'PUBLISHED', 'DISABLED');

-- CreateEnum
CREATE TYPE "chat_message_role" AS ENUM ('SYSTEM', 'USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "ai_models" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "type" "ai_model_type" NOT NULL,
    "model_name" VARCHAR(160) NOT NULL,
    "base_url" VARCHAR(512),
    "api_key_encrypted" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "config_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "file_name" VARCHAR(512) NOT NULL,
    "mime_type" VARCHAR(255),
    "file_size" BIGINT NOT NULL,
    "sha256_hash" VARCHAR(64),
    "loid" BIGINT NOT NULL,
    "status" "file_status" NOT NULL DEFAULT 'UPLOADED',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_bases" (
    "id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "status" "knowledge_base_status" NOT NULL DEFAULT 'ACTIVE',
    "embedding_model_id" UUID NOT NULL,
    "chunk_size" INTEGER NOT NULL DEFAULT 800,
    "chunk_overlap" INTEGER NOT NULL DEFAULT 100,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "knowledge_base_id" UUID NOT NULL,
    "source_file_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "source_type" "document_source_type" NOT NULL,
    "status" "document_status" NOT NULL DEFAULT 'UPLOADED',
    "char_count" INTEGER NOT NULL DEFAULT 0,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chunks" (
    "id" UUID NOT NULL,
    "knowledge_base_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "title" VARCHAR(512),
    "content" TEXT NOT NULL,
    "search_vector" tsvector,
    "position" INTEGER NOT NULL,
    "token_count" INTEGER,
    "char_count" INTEGER NOT NULL DEFAULT 0,
    "status" "chunk_status" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chunk_embeddings" (
    "id" UUID NOT NULL,
    "chunk_id" UUID NOT NULL,
    "embedding_model_id" UUID NOT NULL,
    "embedding" vector NOT NULL,
    "dimension" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chunk_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "model_id" UUID NOT NULL,
    "system_prompt" TEXT NOT NULL,
    "opening_message" TEXT,
    "status" "agent_status" NOT NULL DEFAULT 'DRAFT',
    "temperature" DECIMAL(4,3),
    "top_p" DECIMAL(4,3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_knowledge_bases" (
    "agent_id" UUID NOT NULL,
    "knowledge_base_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_knowledge_bases_pkey" PRIMARY KEY ("agent_id","knowledge_base_id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "title" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "role" "chat_message_role" NOT NULL,
    "content" TEXT NOT NULL,
    "model_id" UUID,
    "token_usage" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_citations" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "chunk_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "score" DECIMAL(8,6),
    "quote" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_citations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_models_type_is_enabled_idx" ON "ai_models"("type", "is_enabled");

-- CreateIndex
CREATE INDEX "ai_models_provider_model_name_idx" ON "ai_models"("provider", "model_name");

-- CreateIndex
CREATE INDEX "files_loid_idx" ON "files"("loid");

-- CreateIndex
CREATE INDEX "files_sha256_hash_idx" ON "files"("sha256_hash");

-- CreateIndex
CREATE INDEX "files_status_idx" ON "files"("status");

-- CreateIndex
CREATE INDEX "knowledge_bases_name_idx" ON "knowledge_bases"("name");

-- CreateIndex
CREATE INDEX "knowledge_bases_status_idx" ON "knowledge_bases"("status");

-- CreateIndex
CREATE INDEX "knowledge_bases_embedding_model_id_idx" ON "knowledge_bases"("embedding_model_id");

-- CreateIndex
CREATE INDEX "documents_knowledge_base_id_idx" ON "documents"("knowledge_base_id");

-- CreateIndex
CREATE INDEX "documents_source_file_id_idx" ON "documents"("source_file_id");

-- CreateIndex
CREATE INDEX "documents_knowledge_base_id_status_idx" ON "documents"("knowledge_base_id", "status");

-- CreateIndex
CREATE INDEX "documents_knowledge_base_id_source_type_idx" ON "documents"("knowledge_base_id", "source_type");

-- CreateIndex
CREATE INDEX "chunks_knowledge_base_id_idx" ON "chunks"("knowledge_base_id");

-- CreateIndex
CREATE INDEX "chunks_document_id_idx" ON "chunks"("document_id");

-- CreateIndex
CREATE INDEX "chunks_knowledge_base_id_status_idx" ON "chunks"("knowledge_base_id", "status");

-- CreateIndex
CREATE INDEX "chunks_search_vector_idx" ON "chunks" USING GIN ("search_vector");

-- CreateIndex
CREATE UNIQUE INDEX "chunks_document_id_position_key" ON "chunks"("document_id", "position");

-- CreateIndex
CREATE INDEX "chunk_embeddings_chunk_id_idx" ON "chunk_embeddings"("chunk_id");

-- CreateIndex
CREATE INDEX "chunk_embeddings_embedding_model_id_idx" ON "chunk_embeddings"("embedding_model_id");

-- CreateIndex
CREATE UNIQUE INDEX "chunk_embeddings_chunk_id_embedding_model_id_key" ON "chunk_embeddings"("chunk_id", "embedding_model_id");

-- CreateIndex
CREATE INDEX "agents_name_idx" ON "agents"("name");

-- CreateIndex
CREATE INDEX "agents_status_idx" ON "agents"("status");

-- CreateIndex
CREATE INDEX "agents_model_id_idx" ON "agents"("model_id");

-- CreateIndex
CREATE INDEX "agent_knowledge_bases_knowledge_base_id_idx" ON "agent_knowledge_bases"("knowledge_base_id");

-- CreateIndex
CREATE INDEX "chat_sessions_agent_id_idx" ON "chat_sessions"("agent_id");

-- CreateIndex
CREATE INDEX "chat_sessions_agent_id_updated_at_idx" ON "chat_sessions"("agent_id", "updated_at");

-- CreateIndex
CREATE INDEX "chat_messages_session_id_idx" ON "chat_messages"("session_id");

-- CreateIndex
CREATE INDEX "chat_messages_session_id_created_at_idx" ON "chat_messages"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "chat_messages_role_idx" ON "chat_messages"("role");

-- CreateIndex
CREATE INDEX "chat_citations_message_id_idx" ON "chat_citations"("message_id");

-- CreateIndex
CREATE INDEX "chat_citations_chunk_id_idx" ON "chat_citations"("chunk_id");

-- CreateIndex
CREATE INDEX "chat_citations_document_id_idx" ON "chat_citations"("document_id");

-- AddForeignKey
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_embedding_model_id_fkey" FOREIGN KEY ("embedding_model_id") REFERENCES "ai_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chunk_embeddings" ADD CONSTRAINT "chunk_embeddings_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "chunks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chunk_embeddings" ADD CONSTRAINT "chunk_embeddings_embedding_model_id_fkey" FOREIGN KEY ("embedding_model_id") REFERENCES "ai_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_knowledge_bases" ADD CONSTRAINT "agent_knowledge_bases_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_knowledge_bases" ADD CONSTRAINT "agent_knowledge_bases_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_citations" ADD CONSTRAINT "chat_citations_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_citations" ADD CONSTRAINT "chat_citations_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "chunks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_citations" ADD CONSTRAINT "chat_citations_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
