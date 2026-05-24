import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  EmbeddingService,
  PrismaService,
  RetrievalService,
} from '@libs/shared';
import {
  AiModelType,
  ChunkStatus,
  DocumentSourceType,
  DocumentStatus,
  KnowledgeBaseStatus,
} from '@libs/shared/generated/prisma/enums';
import type { Prisma } from '@libs/shared/generated/prisma/client';
import type {
  ChunkDraftPayload,
  ChunkPayload,
  ChunkUpdatePayload,
  MarkdownParsePayload,
  ManualDocumentPayload,
  RetrievalTestPayload,
} from '@zeta/common/knowledge-docs';
import { chunkSelect, documentSelect } from './knowledge-docs.select';

type ChunkDraft = {
  id: string;
  title: string | null;
  content: string;
  status: ChunkStatus;
  position: number;
  charCount: number;
};

type EmbeddableChunk = {
  id: string;
  title: string | null;
  content: string;
};

const MAX_DOCUMENT_CONTENT_LENGTH = 200_000;
const MAX_CHUNK_CONTENT_LENGTH = 102_400;
const MAX_CHUNK_COUNT = 200;

@Injectable()
export class KnowledgeDocsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly retrievalService: RetrievalService,
  ) {}

  async listByKnowledgeBase(knowledgeBaseId: string) {
    await this.requireKnowledgeBase(knowledgeBaseId);

    return this.prisma.document.findMany({
      where: { knowledgeBaseId },
      orderBy: { updatedAt: 'desc' },
      select: documentSelect,
    });
  }

  async createManual(knowledgeBaseId: string, input: ManualDocumentPayload) {
    const knowledgeBase =
      await this.requireIndexableKnowledgeBase(knowledgeBaseId);
    const name = input.name?.trim();
    const chunks = this.toChunkDrafts(input.chunks);

    if (!name) {
      throw new BadRequestException('name is required');
    }

    this.assertDocumentChunks(chunks);

    const document = await this.prisma.document.create({
      data: {
        knowledgeBase: { connect: { id: knowledgeBase.id } },
        name,
        sourceType: DocumentSourceType.MANUAL,
        status: DocumentStatus.CHUNKING,
        charCount: this.countChars(chunks),
        chunkCount: chunks.length,
        metadata: {
          description: input.description?.trim() || null,
        },
      },
      select: documentSelect,
    });

    try {
      await this.createChunks(knowledgeBase.id, document.id, chunks);
      await this.refreshDocumentSearchVector(document.id);

      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.EMBEDDING, errorMessage: null },
      });

      await this.rebuildDocumentEmbeddings(
        document.id,
        knowledgeBase.embeddingModel,
      );

      return this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.INDEXED, errorMessage: null },
        select: documentSelect,
      });
    } catch (cause) {
      await this.prisma.document.update({
        where: { id: document.id },
        data: {
          status: DocumentStatus.FAILED,
          errorMessage:
            cause instanceof Error ? cause.message : 'document indexing failed',
        },
      });

      throw cause;
    }
  }

  async parseMarkdown(knowledgeBaseId: string, input: MarkdownParsePayload) {
    await this.requireKnowledgeBase(knowledgeBaseId);

    const content = this.normalizeText(input.content);

    if (!content) {
      throw new BadRequestException('content is required');
    }

    if (content.length > MAX_DOCUMENT_CONTENT_LENGTH) {
      throw new BadRequestException(
        `content cannot exceed ${MAX_DOCUMENT_CONTENT_LENGTH} characters`,
      );
    }

    return {
      chunks: this.parseMarkdownChunks(content),
    };
  }

  async listChunks(documentId: string) {
    await this.requireDocument(documentId);

    return this.prisma.chunk.findMany({
      where: { documentId },
      orderBy: { position: 'asc' },
      select: chunkSelect,
    });
  }

  async createChunk(documentId: string, input: ChunkPayload) {
    const document = await this.requireIndexableDocument(documentId);
    const chunk = this.toSingleChunkDraft(input, 0);
    const activeChunkCount = await this.countActiveChunks(document.id);

    if (chunk.status === ChunkStatus.DISABLED && activeChunkCount === 0) {
      throw new BadRequestException('document must have active chunks');
    }

    const position = await this.prisma.chunk.count({ where: { documentId } });
    const created = await this.prisma.chunk.create({
      data: {
        id: randomUUID(),
        knowledgeBaseId: document.knowledgeBaseId,
        documentId,
        title: chunk.title,
        content: chunk.content,
        position,
        charCount: chunk.charCount,
        status: chunk.status,
      },
      select: chunkSelect,
    });

    await this.refreshChunkSearchVector(created.id);

    if (created.status === ChunkStatus.ACTIVE) {
      await this.rebuildChunkEmbedding(
        created.id,
        document.knowledgeBase.embeddingModel,
      );
    }

    await this.refreshDocumentStats(documentId);

    return this.prisma.chunk.findUniqueOrThrow({
      where: { id: created.id },
      select: chunkSelect,
    });
  }

  async updateChunk(id: string, input: ChunkUpdatePayload) {
    const chunk = await this.requireIndexableChunk(id);
    const nextContent =
      input.content === undefined
        ? chunk.content
        : this.normalizeText(input.content);
    const nextStatus = this.normalizeChunkStatus(input.status, chunk.status);

    if (!nextContent) {
      throw new BadRequestException('chunk content is required');
    }

    if (nextContent.length > MAX_CHUNK_CONTENT_LENGTH) {
      throw new BadRequestException(
        `chunk content cannot exceed ${MAX_CHUNK_CONTENT_LENGTH} characters`,
      );
    }

    if (nextStatus === ChunkStatus.DISABLED) {
      await this.assertCanDeactivateChunk(chunk.id, chunk.documentId);
    }

    const updated = await this.prisma.chunk.update({
      where: { id },
      data: {
        title:
          input.title === undefined
            ? chunk.title
            : this.normalizeTitle(input.title),
        content: nextContent,
        charCount: nextContent.length,
        status: nextStatus,
      },
      select: chunkSelect,
    });

    await this.refreshChunkSearchVector(updated.id);

    if (updated.status === ChunkStatus.ACTIVE) {
      await this.rebuildChunkEmbedding(
        updated.id,
        chunk.document.knowledgeBase.embeddingModel,
      );
    } else {
      await this.prisma.chunkEmbedding.deleteMany({ where: { chunkId: id } });
    }

    await this.refreshDocumentStats(updated.documentId);

    return updated;
  }

  async removeChunk(id: string) {
    const chunk = await this.requireIndexableChunk(id);

    if (chunk.status === ChunkStatus.ACTIVE) {
      await this.assertCanDeactivateChunk(chunk.id, chunk.documentId);
    }

    await this.prisma.chatCitation.deleteMany({ where: { chunkId: id } });
    await this.prisma.chunkEmbedding.deleteMany({ where: { chunkId: id } });
    await this.prisma.chunk.delete({ where: { id } });
    await this.reorderDocumentChunks(chunk.documentId);
    await this.refreshDocumentStats(chunk.documentId);

    return { id };
  }

  async remove(documentId: string) {
    await this.requireDocument(documentId);

    const chunks = await this.prisma.chunk.findMany({
      where: { documentId },
      select: { id: true },
    });
    const chunkIds = chunks.map((chunk) => chunk.id);

    if (chunkIds.length > 0) {
      await this.prisma.chatCitation.deleteMany({
        where: {
          OR: [{ documentId }, { chunkId: { in: chunkIds } }],
        },
      });
      await this.prisma.chunkEmbedding.deleteMany({
        where: { chunkId: { in: chunkIds } },
      });
      await this.prisma.chunk.deleteMany({ where: { id: { in: chunkIds } } });
    }

    await this.prisma.document.delete({ where: { id: documentId } });

    return { id: documentId };
  }

  async retrievalTest(knowledgeBaseId: string, input: RetrievalTestPayload) {
    return this.retrievalService.retrieveFromKnowledgeBase(
      knowledgeBaseId,
      input.question,
      input.topK,
    );
  }

  private async createChunks(
    knowledgeBaseId: string,
    documentId: string,
    chunks: ChunkDraft[],
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
      })),
    });
  }

  private async rebuildDocumentEmbeddings(
    documentId: string,
    embeddingModel: EmbeddingModelConfig,
  ) {
    const activeChunks = await this.prisma.chunk.findMany({
      where: { documentId, status: ChunkStatus.ACTIVE },
      orderBy: { position: 'asc' },
      select: { id: true, title: true, content: true },
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
      await this.embeddingService.embedTexts(
        embeddingModel,
        activeChunks.map((chunk) => this.toEmbeddingText(chunk)),
      ),
    );
  }

  private async rebuildChunkEmbedding(
    chunkId: string,
    embeddingModel: EmbeddingModelConfig,
  ) {
    const chunk = await this.prisma.chunk.findUniqueOrThrow({
      where: { id: chunkId },
      select: { id: true, title: true, content: true },
    });

    await this.prisma.chunkEmbedding.deleteMany({
      where: { chunkId, embeddingModelId: embeddingModel.id },
    });

    await this.createEmbeddings(
      embeddingModel.id,
      [chunk],
      await this.embeddingService.embedTexts(embeddingModel, [
        this.toEmbeddingText(chunk),
      ]),
    );
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

  private async refreshDocumentSearchVector(documentId: string) {
    await this.prisma.$executeRaw`
      UPDATE "chunks"
      SET "search_vector" = to_tsvector('simple', COALESCE("title", '') || ' ' || "content")
      WHERE "document_id" = ${documentId}::uuid
    `;
  }

  private async refreshChunkSearchVector(chunkId: string) {
    await this.prisma.$executeRaw`
      UPDATE "chunks"
      SET "search_vector" = to_tsvector('simple', COALESCE("title", '') || ' ' || "content")
      WHERE "id" = ${chunkId}::uuid
    `;
  }

  private async refreshDocumentStats(documentId: string) {
    const chunks = await this.prisma.chunk.findMany({
      where: { documentId },
      select: { charCount: true },
    });

    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        charCount: chunks.reduce((total, chunk) => total + chunk.charCount, 0),
        chunkCount: chunks.length,
        status: DocumentStatus.INDEXED,
        errorMessage: null,
      },
    });
  }

  private async reorderDocumentChunks(documentId: string) {
    const chunks = await this.prisma.chunk.findMany({
      where: { documentId },
      orderBy: { position: 'asc' },
      select: { id: true },
    });

    for (const [position, chunk] of chunks.entries()) {
      await this.prisma.chunk.update({
        where: { id: chunk.id },
        data: { position },
      });
    }
  }

  private parseMarkdownChunks(content: string) {
    const chunks: ChunkDraftPayload[] = [];
    const lines = content.split('\n');
    let title: string | null = null;
    let buffer: string[] = [];

    const flush = () => {
      const body = buffer.join('\n').trim();
      const chunkContent = body || title || '';

      if (chunkContent) {
        for (const contentPart of this.splitLongChunk(chunkContent)) {
          chunks.push({
            title,
            content: contentPart,
            status: ChunkStatus.ACTIVE,
          });
        }
      }

      buffer = [];
    };

    for (const line of lines) {
      const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);

      if (heading) {
        flush();
        title = heading[2].trim();
      } else {
        buffer.push(line);
      }
    }

    flush();

    if (chunks.length === 0) {
      throw new BadRequestException('markdown content cannot be parsed');
    }

    if (chunks.length > MAX_CHUNK_COUNT) {
      throw new BadRequestException(
        `chunk count cannot exceed ${MAX_CHUNK_COUNT}`,
      );
    }

    return chunks;
  }

  private splitLongChunk(content: string) {
    if (content.length <= MAX_CHUNK_CONTENT_LENGTH) {
      return [content];
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < content.length) {
      chunks.push(content.slice(start, start + MAX_CHUNK_CONTENT_LENGTH));
      start += MAX_CHUNK_CONTENT_LENGTH;
    }

    return chunks;
  }

  private toChunkDrafts(chunks: ChunkDraftPayload[] | undefined) {
    if (!Array.isArray(chunks)) {
      throw new BadRequestException('chunks are required');
    }

    return chunks.map((chunk, index) => this.toSingleChunkDraft(chunk, index));
  }

  private toSingleChunkDraft(input: ChunkDraftPayload, position: number) {
    const content = this.normalizeText(input.content);

    if (!content) {
      throw new BadRequestException('chunk content is required');
    }

    if (content.length > MAX_CHUNK_CONTENT_LENGTH) {
      throw new BadRequestException(
        `chunk content cannot exceed ${MAX_CHUNK_CONTENT_LENGTH} characters`,
      );
    }

    return {
      id: randomUUID(),
      title: this.normalizeTitle(input.title),
      content,
      status: this.normalizeChunkStatus(input.status, ChunkStatus.ACTIVE),
      position,
      charCount: content.length,
    };
  }

  private assertDocumentChunks(chunks: ChunkDraft[]) {
    if (chunks.length === 0) {
      throw new BadRequestException('at least one chunk is required');
    }

    if (chunks.length > MAX_CHUNK_COUNT) {
      throw new BadRequestException(
        `chunk count cannot exceed ${MAX_CHUNK_COUNT}`,
      );
    }

    if (!chunks.some((chunk) => chunk.status === ChunkStatus.ACTIVE)) {
      throw new BadRequestException('document must have active chunks');
    }

    if (this.countChars(chunks) > MAX_DOCUMENT_CONTENT_LENGTH) {
      throw new BadRequestException(
        `document content cannot exceed ${MAX_DOCUMENT_CONTENT_LENGTH} characters`,
      );
    }
  }

  private countChars(chunks: Array<{ charCount: number }>) {
    return chunks.reduce((total, chunk) => total + chunk.charCount, 0);
  }

  private normalizeText(content: string | undefined) {
    return content?.replace(/\r\n/g, '\n').trim() ?? '';
  }

  private normalizeTitle(title: string | null | undefined) {
    const normalizedTitle = title?.trim();

    return normalizedTitle ? normalizedTitle.slice(0, 512) : null;
  }

  private normalizeChunkStatus(
    status: ChunkStatus | undefined,
    fallback: ChunkStatus,
  ) {
    if (status === undefined) {
      return fallback;
    }

    if (status !== ChunkStatus.ACTIVE && status !== ChunkStatus.DISABLED) {
      throw new BadRequestException('chunk status is invalid');
    }

    return status;
  }

  private toEmbeddingText(chunk: EmbeddableChunk) {
    return chunk.title ? `${chunk.title}\n${chunk.content}` : chunk.content;
  }

  private toVectorLiteral(embedding: number[]) {
    return `[${embedding.join(',')}]`;
  }

  private async assertCanDeactivateChunk(chunkId: string, documentId: string) {
    const activeChunkCount = await this.prisma.chunk.count({
      where: {
        documentId,
        status: ChunkStatus.ACTIVE,
        NOT: { id: chunkId },
      },
    });

    if (activeChunkCount === 0) {
      throw new BadRequestException('document must have active chunks');
    }
  }

  private async countActiveChunks(documentId: string) {
    return this.prisma.chunk.count({
      where: { documentId, status: ChunkStatus.ACTIVE },
    });
  }

  private async requireDocument(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!document) {
      throw new NotFoundException('document does not exist');
    }

    return document;
  }

  private async requireKnowledgeBase(id: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!knowledgeBase) {
      throw new NotFoundException('knowledge base does not exist');
    }

    return knowledgeBase;
  }

  private async requireIndexableDocument(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        knowledgeBaseId: true,
        knowledgeBase: {
          select: this.indexableKnowledgeBaseSelect,
        },
      },
    });

    if (!document) {
      throw new NotFoundException('document does not exist');
    }

    this.assertIndexableKnowledgeBase(document.knowledgeBase);

    return document;
  }

  private async requireIndexableChunk(id: string) {
    const chunk = await this.prisma.chunk.findUnique({
      where: { id },
      select: {
        id: true,
        documentId: true,
        title: true,
        content: true,
        status: true,
        document: {
          select: {
            knowledgeBase: {
              select: this.indexableKnowledgeBaseSelect,
            },
          },
        },
      },
    });

    if (!chunk) {
      throw new NotFoundException('chunk does not exist');
    }

    this.assertIndexableKnowledgeBase(chunk.document.knowledgeBase);

    return chunk;
  }

  private async requireIndexableKnowledgeBase(id: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id },
      select: this.indexableKnowledgeBaseSelect,
    });

    if (!knowledgeBase) {
      throw new NotFoundException('knowledge base does not exist');
    }

    this.assertIndexableKnowledgeBase(knowledgeBase);

    return knowledgeBase;
  }

  private assertIndexableKnowledgeBase(knowledgeBase: IndexableKnowledgeBase) {
    if (knowledgeBase.status !== KnowledgeBaseStatus.ACTIVE) {
      throw new BadRequestException('knowledge base is disabled');
    }

    if (
      knowledgeBase.embeddingModel.type !== AiModelType.EMBEDDING ||
      !knowledgeBase.embeddingModel.isEnabled
    ) {
      throw new BadRequestException(
        'knowledge base embedding model must be enabled',
      );
    }
  }

  private readonly indexableKnowledgeBaseSelect = {
    id: true,
    status: true,
    embeddingModel: {
      select: {
        id: true,
        type: true,
        isEnabled: true,
        modelName: true,
        baseUrl: true,
        apiKey: true,
        configJson: true,
      },
    },
  } as const;
}

type IndexableKnowledgeBase = {
  id: string;
  status: KnowledgeBaseStatus;
  embeddingModel: EmbeddingModelConfig & {
    type: AiModelType;
    isEnabled: boolean;
  };
};

type EmbeddingModelConfig = {
  id: string;
  modelName: string;
  baseUrl: string | null;
  apiKey: string | null;
  configJson: Prisma.JsonValue;
};
