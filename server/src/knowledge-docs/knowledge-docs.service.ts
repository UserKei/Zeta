import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FileStorageService, PrismaService } from '@libs/shared';
import {
  ChunkStatus,
  DocumentSourceType,
  DocumentStatus,
} from '@libs/shared/generated/prisma/enums';
import type { Prisma } from '@libs/shared/generated/prisma/client';
import type {
  ChunkReorderPayload,
  ChunkPayload,
  ChunkUpdatePayload,
  DocumentUpdatePayload,
  KnowledgeChunkListQuery,
  KnowledgeDocumentListQuery,
  ManualDocumentPayload,
  RetrievalTestPayload,
} from '@zeta/common/knowledge-docs';
import { normalizePagination, toPageResult } from '../common/pagination';
import { MAX_CHUNK_CONTENT_LENGTH } from './knowledge-docs.constants';
import {
  assertDocumentChunks,
  countChunkChars,
  normalizeChunkStatus,
  normalizeText,
  normalizeTitle,
  toChunkDrafts,
  toSingleChunkDraft,
} from './chunk-draft-normalizer';
import {
  AiExtractedDocumentService,
  type AiExtractedChunkInput,
} from './ai-extracted-document.service';
import { DocumentAssetService } from './document-asset.service';
import { DocumentProcessingJobService } from './document-processing-job.service';
import { ChunkIndexingService } from './chunk-indexing.service';
import { chunkSelect, documentSelect } from './knowledge-docs.select';
import { toDocumentResponse } from './document-response.mapper';
import {
  indexableKnowledgeBaseSelect,
  withIndexableEmbeddingModel,
} from './knowledge-base-model-resolver';
import { RetrievalService } from '../retrieval/retrieval.service';

type KnowledgeDocsDbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class KnowledgeDocsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorageService: FileStorageService,
    private readonly retrievalService: RetrievalService,
    private readonly aiExtractedDocumentService: AiExtractedDocumentService,
    private readonly documentAssetService: DocumentAssetService,
    private readonly chunkIndexingService: ChunkIndexingService,
    @Optional()
    private readonly documentProcessingJobService?: DocumentProcessingJobService,
  ) {}

  async listByKnowledgeBase(
    knowledgeBaseId: string,
    query: KnowledgeDocumentListQuery = {},
  ) {
    await this.requireKnowledgeBase(knowledgeBaseId);
    const pagination = normalizePagination(query);
    const keyword = query.keyword?.trim();
    const where: Prisma.DocumentWhereInput = {
      knowledgeBaseId,
    };

    if (query.status && query.status !== 'ALL') {
      where.status = query.status;
    }

    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { errorMessage: { contains: keyword } },
      ];
    }

    const [total, documents] = await Promise.all([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        select: documentSelect,
      }),
    ]);

    return toPageResult(documents.map(toDocumentResponse), total, pagination);
  }

  async getDocument(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: documentSelect,
    });

    if (!document) {
      throw new NotFoundException('document does not exist');
    }

    return toDocumentResponse(document);
  }

  async reindexDocument(id: string) {
    const document = await this.requireIndexableDocument(id);

    if (document.chunkCount <= 0) {
      throw new BadRequestException('document must have chunks');
    }

    const embeddingDocument = await this.queueDocumentEmbedding(
      document.id,
      document.knowledgeBaseId,
    );

    return toDocumentResponse(embeddingDocument);
  }

  async updateDocument(id: string, input: DocumentUpdatePayload) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: documentSelect,
    });

    if (!document) {
      throw new NotFoundException('document does not exist');
    }

    const data: Prisma.DocumentUpdateInput = {};

    if (input.name !== undefined) {
      const name = input.name.trim();

      if (!name) {
        throw new BadRequestException('name is required');
      }

      data.name = name;
    }

    if (input.description !== undefined) {
      data.metadata = {
        ...this.toMetadataObject(document.metadata),
        description: input.description?.trim() || null,
      };
    }

    if (Object.keys(data).length === 0) {
      return toDocumentResponse(document);
    }

    const updated = await this.prisma.document.update({
      where: { id },
      data,
      select: documentSelect,
    });

    return toDocumentResponse(updated);
  }

  async createManual(knowledgeBaseId: string, input: ManualDocumentPayload) {
    const knowledgeBase =
      await this.requireIndexableKnowledgeBase(knowledgeBaseId);
    const name = input.name?.trim();
    const chunks = toChunkDrafts(input.chunks);

    if (!name) {
      throw new BadRequestException('name is required');
    }

    if (chunks.length > 0) {
      assertDocumentChunks(chunks);
    }

    const document = await this.prisma.document.create({
      data: {
        knowledgeBase: { connect: { id: knowledgeBase.id } },
        name,
        sourceType: DocumentSourceType.MANUAL,
        status:
          chunks.length === 0 ? DocumentStatus.DRAFT : DocumentStatus.CHUNKING,
        charCount: countChunkChars(chunks),
        chunkCount: chunks.length,
        metadata: {
          description: input.description?.trim() || null,
        },
      },
      select: documentSelect,
    });

    if (chunks.length === 0) {
      return toDocumentResponse(document);
    }

    try {
      await this.chunkIndexingService.createChunks(
        knowledgeBase.id,
        document.id,
        chunks,
      );
      await this.chunkIndexingService.refreshDocumentSearchVector(document.id);

      const embeddingDocument = await this.queueDocumentEmbedding(
        document.id,
        knowledgeBase.id,
      );

      return toDocumentResponse(embeddingDocument);
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

  async createAiExtractedChunk(
    knowledgeBaseId: string,
    input: AiExtractedChunkInput,
  ) {
    return this.aiExtractedDocumentService.createChunk(knowledgeBaseId, input);
  }

  async listChunks(documentId: string, query: KnowledgeChunkListQuery = {}) {
    await this.requireDocument(documentId);
    const pagination = normalizePagination(query);
    const keyword = query.keyword?.trim();
    const where: Prisma.ChunkWhereInput = { documentId };

    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { content: { contains: keyword } },
      ];
    }

    const [total, chunks] = await Promise.all([
      this.prisma.chunk.count({ where }),
      this.prisma.chunk.findMany({
        where,
        orderBy: { position: 'asc' },
        skip: pagination.skip,
        take: pagination.take,
        select: chunkSelect,
      }),
    ]);

    return toPageResult(chunks, total, pagination);
  }

  async createChunk(documentId: string, input: ChunkPayload) {
    const document = await this.requireIndexableDocument(documentId);
    const chunk = toSingleChunkDraft(input, 0);
    const activeChunkCount = await this.countActiveChunks(document.id);

    if (chunk.status === ChunkStatus.DISABLED && activeChunkCount === 0) {
      throw new BadRequestException('document must have active chunks');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      let position = await tx.chunk.count({ where: { documentId } });

      if (input.afterChunkId) {
        const previousChunk = await tx.chunk.findFirst({
          where: { id: input.afterChunkId, documentId },
          select: { position: true },
        });

        if (!previousChunk) {
          throw new NotFoundException('after chunk does not exist');
        }

        position = previousChunk.position + 1;

        const movingChunks = await tx.chunk.findMany({
          where: { documentId, position: { gte: position } },
          orderBy: { position: 'desc' },
          select: { id: true, position: true },
        });

        for (const movingChunk of movingChunks) {
          await tx.chunk.update({
            where: { id: movingChunk.id },
            data: { position: movingChunk.position + 1 },
          });
        }
      }

      return tx.chunk.create({
        data: {
          id: randomUUID(),
          knowledgeBaseId: document.knowledgeBaseId,
          documentId,
          title: chunk.title,
          content: chunk.content,
          position,
          charCount: chunk.charCount,
          status: chunk.status,
          metadata: chunk.metadata,
        },
        select: chunkSelect,
      });
    });

    await this.chunkIndexingService.refreshChunkSearchVector(created.id);
    await this.chunkIndexingService.refreshDocumentStats(documentId);
    await this.queueDocumentEmbedding(documentId, document.knowledgeBaseId);

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
        : normalizeText(input.content);
    const nextStatus = normalizeChunkStatus(input.status, chunk.status);

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
          input.title === undefined ? chunk.title : normalizeTitle(input.title),
        content: nextContent,
        charCount: nextContent.length,
        status: nextStatus,
      },
      select: chunkSelect,
    });

    await this.chunkIndexingService.refreshChunkSearchVector(updated.id);
    await this.chunkIndexingService.deleteChunkEmbeddings(updated.id);
    await this.chunkIndexingService.refreshDocumentStats(updated.documentId);
    await this.queueDocumentEmbedding(
      updated.documentId,
      chunk.document.knowledgeBase.id,
    );

    return updated;
  }

  async removeChunk(id: string) {
    const chunk = await this.requireIndexableChunk(id);

    if (chunk.status === ChunkStatus.ACTIVE) {
      await this.assertCanDeactivateChunk(chunk.id, chunk.documentId);
    }

    await this.prisma.chatCitation.deleteMany({ where: { chunkId: id } });
    await this.chunkIndexingService.deleteChunkEmbeddings(id);
    await this.prisma.chunk.delete({ where: { id } });
    await this.chunkIndexingService.reorderDocumentChunks(chunk.documentId);
    await this.chunkIndexingService.refreshIndexedDocumentStats(
      chunk.documentId,
    );

    return { id };
  }

  async removeImprovedChunk(
    id: string,
    db: KnowledgeDocsDbClient = this.prisma,
  ) {
    const chunk = await db.chunk.findUnique({
      where: { id },
      select: {
        id: true,
        documentId: true,
      },
    });

    if (!chunk) {
      throw new NotFoundException('chunk does not exist');
    }

    await db.chatCitation.deleteMany({ where: { chunkId: id } });
    await this.chunkIndexingService.deleteChunkEmbeddings(id, db);
    await db.chunk.delete({ where: { id } });
    await this.chunkIndexingService.reorderDocumentChunks(chunk.documentId, db);
    await this.chunkIndexingService.refreshIndexedDocumentStats(
      chunk.documentId,
      db,
    );

    return { id };
  }

  async reorderChunks(documentId: string, input: ChunkReorderPayload) {
    await this.requireDocument(documentId);

    if (!Array.isArray(input.chunkIds)) {
      throw new BadRequestException('chunkIds are required');
    }

    const chunks = await this.prisma.chunk.findMany({
      where: { documentId },
      select: { id: true },
    });
    const existingChunkIds = new Set(chunks.map((chunk) => chunk.id));
    const nextChunkIds = new Set(input.chunkIds);

    if (
      chunks.length !== input.chunkIds.length ||
      existingChunkIds.size !== nextChunkIds.size ||
      input.chunkIds.some((chunkId) => !existingChunkIds.has(chunkId))
    ) {
      throw new BadRequestException(
        'chunkIds must include all document chunks',
      );
    }

    const temporaryPositionOffset = 100_000;

    await this.prisma.$transaction(async (tx) => {
      for (const [position, chunkId] of input.chunkIds.entries()) {
        await tx.chunk.update({
          where: { id: chunkId },
          data: { position: position + temporaryPositionOffset },
        });
      }

      for (const [position, chunkId] of input.chunkIds.entries()) {
        await tx.chunk.update({
          where: { id: chunkId },
          data: { position },
        });
      }
    });

    return this.findChunksByDocument(documentId);
  }

  async remove(documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, sourceFileId: true, metadata: true },
    });

    if (!document) {
      throw new NotFoundException('document does not exist');
    }

    await this.prisma.$transaction(async (db) => {
      const chunks = await db.chunk.findMany({
        where: { documentId },
        select: { id: true },
      });
      const chunkIds = chunks.map((chunk) => chunk.id);

      if (chunkIds.length > 0) {
        await db.chatCitation.deleteMany({
          where: {
            OR: [{ documentId }, { chunkId: { in: chunkIds } }],
          },
        });
        await db.chunkEmbedding.deleteMany({
          where: { chunkId: { in: chunkIds } },
        });
        await db.chunk.deleteMany({ where: { id: { in: chunkIds } } });
      }

      await db.document.delete({ where: { id: documentId } });
    });
    await this.fileStorageService.removeFilesIfUnreferenced(
      [
        document.sourceFileId,
        ...this.documentAssetService.getDocumentAssetFileIds(document.metadata),
      ].filter((fileId): fileId is string => Boolean(fileId)),
    );

    return { id: documentId };
  }

  async retrievalTest(knowledgeBaseId: string, input: RetrievalTestPayload) {
    return this.retrievalService.retrieveFromKnowledgeBase(
      knowledgeBaseId,
      input.question,
      input.topK,
    );
  }

  private toMetadataObject(metadata: Prisma.JsonValue) {
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      return metadata as Record<string, Prisma.JsonValue>;
    }

    return {};
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

  private async findChunksByDocument(documentId: string) {
    return this.prisma.chunk.findMany({
      where: { documentId },
      orderBy: { position: 'asc' },
      select: chunkSelect,
    });
  }

  private async queueDocumentEmbedding(
    documentId: string,
    knowledgeBaseId: string,
  ) {
    const embeddingDocument = await this.prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.EMBEDDING, errorMessage: null },
      select: documentSelect,
    });

    if (!this.documentProcessingJobService) {
      throw new Error('document processing queue is not configured');
    }

    try {
      await this.documentProcessingJobService.enqueueDocumentEmbedding({
        documentId,
        knowledgeBaseId,
        requestedAt: embeddingDocument.updatedAt.toISOString(),
      });
    } catch (cause) {
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.FAILED,
          errorMessage:
            cause instanceof Error ? cause.message : 'document indexing failed',
        },
      });

      throw cause;
    }

    return embeddingDocument;
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
      select: { id: true, chunkSize: true, chunkOverlap: true },
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
        chunkCount: true,
        knowledgeBase: {
          select: indexableKnowledgeBaseSelect,
        },
      },
    });

    if (!document) {
      throw new NotFoundException('document does not exist');
    }

    const knowledgeBase = withIndexableEmbeddingModel(document.knowledgeBase);

    return {
      ...document,
      knowledgeBase,
    };
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
              select: indexableKnowledgeBaseSelect,
            },
          },
        },
      },
    });

    if (!chunk) {
      throw new NotFoundException('chunk does not exist');
    }

    const knowledgeBase = withIndexableEmbeddingModel(
      chunk.document.knowledgeBase,
    );

    return {
      ...chunk,
      document: {
        ...chunk.document,
        knowledgeBase,
      },
    };
  }

  private async requireIndexableKnowledgeBase(id: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id },
      select: indexableKnowledgeBaseSelect,
    });

    if (!knowledgeBase) {
      throw new NotFoundException('knowledge base does not exist');
    }

    return withIndexableEmbeddingModel(knowledgeBase);
  }
}
