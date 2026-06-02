import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  FileStorageService,
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
  ChunkReorderPayload,
  ChunkDraftPayload,
  ChunkPayload,
  ChunkUpdatePayload,
  DocumentUpdatePayload,
  ManualDocumentPayload,
  RetrievalTestPayload,
} from '@zeta/common/knowledge-docs';
import {
  MAX_CHUNK_CONTENT_LENGTH,
  MAX_CHUNK_COUNT,
  MAX_DOCUMENT_CONTENT_LENGTH,
} from './knowledge-docs.constants';
import {
  AiExtractedDocumentService,
  type AiExtractedChunkInput,
} from './ai-extracted-document.service';
import {
  DocumentAssetService,
  type DocumentChunkDraft,
} from './document-asset.service';
import {
  ChunkIndexingService,
  type EmbeddingModelConfig,
} from './chunk-indexing.service';
import { chunkSelect, documentSelect } from './knowledge-docs.select';

type DocumentRecord = Prisma.DocumentGetPayload<{
  select: typeof documentSelect;
}>;

type ChunkDraft = DocumentChunkDraft;

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
  ) {}

  async listByKnowledgeBase(knowledgeBaseId: string) {
    await this.requireKnowledgeBase(knowledgeBaseId);

    const documents = await this.prisma.document.findMany({
      where: { knowledgeBaseId },
      orderBy: { updatedAt: 'desc' },
      select: documentSelect,
    });

    return documents.map((document) => this.toDocumentResponse(document));
  }

  async getDocument(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: documentSelect,
    });

    if (!document) {
      throw new NotFoundException('document does not exist');
    }

    return this.toDocumentResponse(document);
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
      return this.toDocumentResponse(document);
    }

    const updated = await this.prisma.document.update({
      where: { id },
      data,
      select: documentSelect,
    });

    return this.toDocumentResponse(updated);
  }

  async createManual(knowledgeBaseId: string, input: ManualDocumentPayload) {
    const knowledgeBase =
      await this.requireIndexableKnowledgeBase(knowledgeBaseId);
    const name = input.name?.trim();
    const chunks = this.toChunkDrafts(input.chunks);

    if (!name) {
      throw new BadRequestException('name is required');
    }

    if (chunks.length > 0) {
      this.assertDocumentChunks(chunks);
    }

    const document = await this.prisma.document.create({
      data: {
        knowledgeBase: { connect: { id: knowledgeBase.id } },
        name,
        sourceType: DocumentSourceType.MANUAL,
        status:
          chunks.length === 0 ? DocumentStatus.DRAFT : DocumentStatus.CHUNKING,
        charCount: this.countChars(chunks),
        chunkCount: chunks.length,
        metadata: {
          description: input.description?.trim() || null,
        },
      },
      select: documentSelect,
    });

    if (chunks.length === 0) {
      return this.toDocumentResponse(document);
    }

    try {
      await this.chunkIndexingService.createChunks(
        knowledgeBase.id,
        document.id,
        chunks,
      );
      await this.chunkIndexingService.refreshDocumentSearchVector(document.id);

      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.EMBEDDING, errorMessage: null },
      });

      await this.chunkIndexingService.rebuildDocumentEmbeddings(
        document.id,
        knowledgeBase.embeddingModel,
      );

      const indexedDocument = await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.INDEXED, errorMessage: null },
        select: documentSelect,
      });

      return this.toDocumentResponse(indexedDocument);
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
    await this.chunkIndexingService.syncChunkEmbedding(
      created.id,
      document.knowledgeBase.embeddingModel,
      created.status,
    );
    await this.chunkIndexingService.refreshIndexedDocumentStats(documentId);

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

    await this.chunkIndexingService.refreshChunkSearchVector(updated.id);
    await this.chunkIndexingService.syncChunkEmbedding(
      updated.id,
      chunk.document.knowledgeBase.embeddingModel,
      updated.status,
    );
    await this.chunkIndexingService.refreshIndexedDocumentStats(
      updated.documentId,
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

    return this.listChunks(documentId);
  }

  async remove(documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, sourceFileId: true, metadata: true },
    });

    if (!document) {
      throw new NotFoundException('document does not exist');
    }

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
      metadata: this.normalizeChunkMetadata(input.metadata),
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

  private toDocumentResponse(document: DocumentRecord) {
    const { metadata, ...documentData } = document;
    const metadataObject = this.toMetadataObject(metadata);

    return {
      ...documentData,
      description:
        typeof metadataObject.description === 'string'
          ? metadataObject.description
          : null,
    };
  }

  private toMetadataObject(metadata: Prisma.JsonValue) {
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      return metadata as Record<string, Prisma.JsonValue>;
    }

    return {};
  }

  private normalizeText(content: string | undefined) {
    return content?.replace(/\r\n/g, '\n').trim() ?? '';
  }

  private normalizeTitle(title: string | null | undefined) {
    const normalizedTitle = title?.trim();

    return normalizedTitle ? normalizedTitle.slice(0, 512) : null;
  }

  private normalizeChunkMetadata(
    metadata: ChunkDraftPayload['metadata'],
  ): Prisma.InputJsonValue {
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      return metadata as Prisma.InputJsonObject;
    }

    return {};
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
        knowledgeBase: {
          select: this.indexableKnowledgeBaseSelect,
        },
      },
    });

    if (!document) {
      throw new NotFoundException('document does not exist');
    }

    const embeddingModel = this.getIndexableEmbeddingModel(
      document.knowledgeBase,
    );

    return {
      ...document,
      knowledgeBase: {
        ...document.knowledgeBase,
        embeddingModel,
      },
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
              select: this.indexableKnowledgeBaseSelect,
            },
          },
        },
      },
    });

    if (!chunk) {
      throw new NotFoundException('chunk does not exist');
    }

    const embeddingModel = this.getIndexableEmbeddingModel(
      chunk.document.knowledgeBase,
    );

    return {
      ...chunk,
      document: {
        ...chunk.document,
        knowledgeBase: {
          ...chunk.document.knowledgeBase,
          embeddingModel,
        },
      },
    };
  }

  private async requireIndexableKnowledgeBase(id: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id },
      select: this.indexableKnowledgeBaseSelect,
    });

    if (!knowledgeBase) {
      throw new NotFoundException('knowledge base does not exist');
    }

    const embeddingModel = this.getIndexableEmbeddingModel(knowledgeBase);

    return {
      ...knowledgeBase,
      embeddingModel,
    };
  }

  private getIndexableEmbeddingModel(knowledgeBase: IndexableKnowledgeBase) {
    if (knowledgeBase.status !== KnowledgeBaseStatus.ACTIVE) {
      throw new BadRequestException('knowledge base is disabled');
    }

    if (!knowledgeBase.embeddingModel) {
      throw new BadRequestException(
        'knowledge base embedding model is not configured',
      );
    }

    if (
      knowledgeBase.embeddingModel.type !== AiModelType.EMBEDDING ||
      !knowledgeBase.embeddingModel.isEnabled
    ) {
      throw new BadRequestException(
        'knowledge base embedding model must be enabled',
      );
    }

    return knowledgeBase.embeddingModel;
  }

  private readonly indexableKnowledgeBaseSelect = {
    id: true,
    status: true,
    metadata: true,
    chunkSize: true,
    chunkOverlap: true,
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
    visionModel: {
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
  metadata: Prisma.JsonValue;
  chunkSize: number;
  chunkOverlap: number;
  embeddingModel:
    | (EmbeddingModelConfig & {
        type: AiModelType;
        isEnabled: boolean;
      })
    | null;
  visionModel:
    | (ImageUnderstandingModelConfig & {
        type: AiModelType;
        isEnabled: boolean;
      })
    | null;
};

type ImageUnderstandingModelConfig = EmbeddingModelConfig;
