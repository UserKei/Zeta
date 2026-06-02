import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EmbeddingService, type EmbeddingInput } from '@libs/model-adapters';
import { FileStorageService, PrismaService } from '@libs/shared';
import {
  ChunkStatus,
  DocumentStatus,
} from '@libs/shared/generated/prisma/enums';
import type { Prisma } from '@libs/shared/generated/prisma/client';
import type { DocumentChunkDraft } from './document-asset.service';

type KnowledgeDocsDbClient = PrismaService | Prisma.TransactionClient;

type EmbeddableChunk = {
  id: string;
  title: string | null;
  content: string;
  metadata: Prisma.JsonValue;
};

export type EmbeddingModelConfig = {
  id: string;
  modelName: string;
  baseUrl: string | null;
  apiKey: string | null;
  configJson: Prisma.JsonValue;
};

@Injectable()
export class ChunkIndexingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly fileStorageService: FileStorageService,
  ) {}

  async createChunks(
    knowledgeBaseId: string,
    documentId: string,
    chunks: DocumentChunkDraft[],
  ) {
    await this.prisma.chunk.createMany({
      data: chunks.map((chunk) => ({
        id: chunk.id,
        knowledgeBaseId,
        documentId,
        title: chunk.title,
        content: chunk.content,
        position: chunk.position,
        charCount: chunk.charCount,
        status: chunk.status,
        metadata: chunk.metadata,
      })),
    });
  }

  async rebuildDocumentEmbeddings(
    documentId: string,
    embeddingModel: EmbeddingModelConfig,
  ) {
    const activeChunks = await this.prisma.chunk.findMany({
      where: { documentId, status: ChunkStatus.ACTIVE },
      orderBy: { position: 'asc' },
      select: { id: true, title: true, content: true, metadata: true },
    });

    if (activeChunks.length === 0) {
      throw new BadRequestException('document must have active chunks');
    }

    const chunkIds = activeChunks.map((chunk) => chunk.id);

    await this.prisma.chunkEmbedding.deleteMany({
      where: {
        embeddingModelId: embeddingModel.id,
        chunkId: { in: chunkIds },
      },
    });

    await this.createEmbeddings(
      embeddingModel.id,
      activeChunks,
      await this.embeddingService.embedInputs(
        embeddingModel,
        await this.toEmbeddingInputs(activeChunks, embeddingModel),
      ),
    );
  }

  async rebuildChunkEmbedding(
    chunkId: string,
    embeddingModel: EmbeddingModelConfig,
  ) {
    const chunk = await this.prisma.chunk.findUniqueOrThrow({
      where: { id: chunkId },
      select: { id: true, title: true, content: true, metadata: true },
    });

    await this.prisma.chunkEmbedding.deleteMany({
      where: { chunkId, embeddingModelId: embeddingModel.id },
    });

    await this.createEmbeddings(
      embeddingModel.id,
      [chunk],
      await this.embeddingService.embedInputs(
        embeddingModel,
        await this.toEmbeddingInputs([chunk], embeddingModel),
      ),
    );
  }

  async syncChunkEmbedding(
    chunkId: string,
    embeddingModel: EmbeddingModelConfig,
    status: ChunkStatus,
  ) {
    if (status !== ChunkStatus.ACTIVE) {
      await this.deleteChunkEmbeddings(chunkId);

      return;
    }

    await this.rebuildChunkEmbedding(chunkId, embeddingModel);
  }

  async deleteChunkEmbeddings(
    chunkId: string,
    db: KnowledgeDocsDbClient = this.prisma,
  ) {
    await db.chunkEmbedding.deleteMany({ where: { chunkId } });
  }

  async refreshDocumentSearchVector(documentId: string) {
    await this.prisma.$executeRaw`
      UPDATE "chunks"
      SET "search_vector" = to_tsvector('simple', COALESCE("title", '') || ' ' || "content")
      WHERE "document_id" = ${documentId}::uuid
    `;
  }

  async refreshChunkSearchVector(chunkId: string) {
    await this.prisma.$executeRaw`
      UPDATE "chunks"
      SET "search_vector" = to_tsvector('simple', COALESCE("title", '') || ' ' || "content")
      WHERE "id" = ${chunkId}::uuid
    `;
  }

  async refreshDocumentStats(
    documentId: string,
    db: KnowledgeDocsDbClient = this.prisma,
  ) {
    const stats = await this.getDocumentStats(documentId, db);

    await db.document.update({
      where: { id: documentId },
      data: stats,
    });
  }

  async refreshIndexedDocumentStats(
    documentId: string,
    db: KnowledgeDocsDbClient = this.prisma,
  ) {
    const stats = await this.getDocumentStats(documentId, db);

    await db.document.update({
      where: { id: documentId },
      data: {
        ...stats,
        status: DocumentStatus.INDEXED,
        errorMessage: null,
      },
    });
  }

  async reorderDocumentChunks(
    documentId: string,
    db: KnowledgeDocsDbClient = this.prisma,
  ) {
    const chunks = await db.chunk.findMany({
      where: { documentId },
      orderBy: { position: 'asc' },
      select: { id: true },
    });

    for (const [position, chunk] of chunks.entries()) {
      await db.chunk.update({
        where: { id: chunk.id },
        data: { position },
      });
    }
  }

  private async createEmbeddings(
    embeddingModelId: string,
    chunks: EmbeddableChunk[],
    embeddings: number[][],
  ) {
    if (chunks.length !== embeddings.length) {
      throw new BadRequestException('chunk and embedding counts do not match');
    }

    for (const [index, chunk] of chunks.entries()) {
      const embedding = embeddings[index];

      await this.prisma.$executeRaw`
        INSERT INTO "chunk_embeddings"
          ("id", "chunk_id", "embedding_model_id", "embedding", "dimension")
        VALUES
          (${randomUUID()}::uuid, ${chunk.id}::uuid, ${embeddingModelId}::uuid,
           ${this.toVectorLiteral(embedding)}::vector, ${embedding.length})
      `;
    }
  }

  private async getDocumentStats(
    documentId: string,
    db: KnowledgeDocsDbClient,
  ) {
    const chunks = await db.chunk.findMany({
      where: { documentId },
      select: { charCount: true },
    });

    return {
      charCount: chunks.reduce((total, chunk) => total + chunk.charCount, 0),
      chunkCount: chunks.length,
    };
  }

  private async toEmbeddingInputs(
    chunks: EmbeddableChunk[],
    embeddingModel: EmbeddingModelConfig,
  ): Promise<EmbeddingInput[]> {
    return Promise.all(
      chunks.map(async (chunk) => {
        const text = this.toEmbeddingText(chunk);
        const assetFileId = this.getImageAssetFileIdForEmbedding(
          chunk,
          embeddingModel,
        );

        if (!assetFileId) {
          return { text };
        }

        const asset = await this.fileStorageService.readBuffer(assetFileId);

        return {
          text,
          image: {
            dataUrl: this.toDataUrl(
              asset.mimeType || 'application/octet-stream',
              asset.buffer,
            ),
          },
        };
      }),
    );
  }

  private toEmbeddingText(chunk: EmbeddableChunk) {
    return chunk.title ? `${chunk.title}\n${chunk.content}` : chunk.content;
  }

  private getImageAssetFileIdForEmbedding(
    chunk: EmbeddableChunk,
    embeddingModel: EmbeddingModelConfig,
  ) {
    if (!this.isDashScopeMultimodalModel(embeddingModel)) {
      return null;
    }

    const metadata = this.toMetadataObject(chunk.metadata);

    if (metadata.contentKind !== 'PDF_PAGE_IMAGE') {
      return null;
    }

    return typeof metadata.assetFileId === 'string'
      ? metadata.assetFileId
      : null;
  }

  private isDashScopeMultimodalModel(model: EmbeddingModelConfig) {
    const config = this.toMetadataObject(model.configJson);

    return config.protocol === 'dashscope-multimodal';
  }

  private toMetadataObject(metadata: Prisma.JsonValue) {
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      return metadata as Record<string, Prisma.JsonValue>;
    }

    return {};
  }

  private toDataUrl(mimeType: string, buffer: Buffer) {
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  }

  private toVectorLiteral(embedding: number[]) {
    return `[${embedding.join(',')}]`;
  }
}
