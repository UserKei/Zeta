import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@libs/shared';
import {
  ChunkStatus,
  DocumentSourceType,
  DocumentStatus,
} from '@libs/shared/generated/prisma/enums';
import type { Prisma } from '@libs/shared/generated/prisma/client';
import { MAX_CHUNK_CONTENT_LENGTH } from './knowledge-docs.constants';
import {
  ChunkIndexingService,
  type EmbeddingModelConfig,
} from './chunk-indexing.service';
import { chunkSelect, documentSelect } from './knowledge-docs.select';
import {
  toDocumentResponse,
  type DocumentResponse,
} from './document-response.mapper';
import {
  indexableKnowledgeBaseSelect,
  withIndexableEmbeddingModel,
} from './knowledge-base-model-resolver';

type ChunkRecord = Prisma.ChunkGetPayload<{
  select: typeof chunkSelect;
}>;
type KnowledgeDocsDbClient = PrismaService | Prisma.TransactionClient;
type AiExtractedDocumentRecord = DocumentResponse;

export type AiExtractedChunkInput = {
  documentId?: string;
  documentName?: string;
  title?: string | null;
  content: string;
  sourceMessageId: string;
};

export type AiExtractedChunkRecord = {
  document: AiExtractedDocumentRecord;
  chunk: ChunkRecord;
  embeddingModel: EmbeddingModelConfig;
};

@Injectable()
export class AiExtractedDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chunkIndexingService: ChunkIndexingService,
  ) {}

  async createChunk(knowledgeBaseId: string, input: AiExtractedChunkInput) {
    const created = await this.prisma.$transaction((tx) =>
      this.createChunkRecord(knowledgeBaseId, input, tx),
    );

    await this.indexCreatedChunk(created);

    const [updatedDocument, chunk] = await Promise.all([
      this.prisma.document.findUnique({
        where: { id: created.document.id },
        select: documentSelect,
      }),
      this.prisma.chunk.findUniqueOrThrow({
        where: { id: created.chunk.id },
        select: chunkSelect,
      }),
    ]);

    if (!updatedDocument) {
      throw new NotFoundException('document does not exist');
    }

    return {
      document: toDocumentResponse(updatedDocument),
      chunk,
    };
  }

  async createChunkRecord(
    knowledgeBaseId: string,
    input: AiExtractedChunkInput,
    db: KnowledgeDocsDbClient = this.prisma,
  ): Promise<AiExtractedChunkRecord> {
    await this.requireIndexableKnowledgeBase(knowledgeBaseId, db);

    const document = input.documentId
      ? await this.requireTargetDocument(knowledgeBaseId, input.documentId, db)
      : await this.findOrCreateDocument(
          knowledgeBaseId,
          input.documentName,
          input.sourceMessageId,
          db,
        );
    const chunk = await this.createActiveChunkRecord(document, input, db);
    const persistedDocument = await db.document.findUnique({
      where: { id: document.id },
      select: documentSelect,
    });

    if (!persistedDocument) {
      throw new NotFoundException('document does not exist');
    }

    return {
      document: toDocumentResponse(persistedDocument),
      chunk,
      embeddingModel: document.knowledgeBase.embeddingModel,
    };
  }

  async indexCreatedChunk(created: AiExtractedChunkRecord) {
    await this.chunkIndexingService.refreshChunkSearchVector(created.chunk.id);
    await this.chunkIndexingService.syncChunkEmbedding(
      created.chunk.id,
      created.embeddingModel,
      created.chunk.status,
    );
    await this.chunkIndexingService.refreshIndexedDocumentStats(
      created.document.id,
    );
  }

  private async createActiveChunkRecord(
    document: IndexableDocument,
    input: AiExtractedChunkInput,
    db: KnowledgeDocsDbClient,
  ) {
    const content = this.normalizeText(input.content);

    if (!content) {
      throw new BadRequestException('chunk content is required');
    }

    if (content.length > MAX_CHUNK_CONTENT_LENGTH) {
      throw new BadRequestException(
        `chunk content cannot exceed ${MAX_CHUNK_CONTENT_LENGTH} characters`,
      );
    }

    const title = this.normalizeTitle(input.title);
    const position = await db.chunk.count({
      where: { documentId: document.id },
    });

    return db.chunk.create({
      data: {
        id: randomUUID(),
        knowledgeBaseId: document.knowledgeBaseId,
        documentId: document.id,
        title,
        content,
        position,
        charCount: content.length,
        status: ChunkStatus.ACTIVE,
        metadata: {},
      },
      select: chunkSelect,
    });
  }

  private async requireTargetDocument(
    knowledgeBaseId: string,
    documentId: string,
    db: KnowledgeDocsDbClient = this.prisma,
  ) {
    const document = await this.requireIndexableDocument(documentId, db);

    if (document.knowledgeBaseId !== knowledgeBaseId) {
      throw new BadRequestException(
        'document does not belong to the target knowledge base',
      );
    }

    return document;
  }

  private async findOrCreateDocument(
    knowledgeBaseId: string,
    documentName: string | undefined,
    sourceMessageId: string,
    db: KnowledgeDocsDbClient = this.prisma,
  ) {
    const name = documentName?.trim() || '聊天补充知识';
    const existingDocument = await db.document.findFirst({
      where: {
        knowledgeBaseId,
        sourceType: DocumentSourceType.AI_EXTRACTED,
        name,
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    if (existingDocument) {
      return this.requireIndexableDocument(existingDocument.id, db);
    }

    const document = await db.document.create({
      data: {
        knowledgeBase: { connect: { id: knowledgeBaseId } },
        name,
        sourceType: DocumentSourceType.AI_EXTRACTED,
        status: DocumentStatus.CHUNKING,
        metadata: {
          description: '从 Agent 聊天记录标注入库的知识',
          sourceMessageId,
        },
      },
      select: { id: true },
    });

    return this.requireIndexableDocument(document.id, db);
  }

  private async requireIndexableDocument(
    id: string,
    db: KnowledgeDocsDbClient = this.prisma,
  ) {
    const document = await db.document.findUnique({
      where: { id },
      select: {
        id: true,
        knowledgeBaseId: true,
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

  private async requireIndexableKnowledgeBase(
    id: string,
    db: KnowledgeDocsDbClient = this.prisma,
  ) {
    const knowledgeBase = await db.knowledgeBase.findUnique({
      where: { id },
      select: indexableKnowledgeBaseSelect,
    });

    if (!knowledgeBase) {
      throw new NotFoundException('knowledge base does not exist');
    }

    return withIndexableEmbeddingModel(knowledgeBase);
  }

  private normalizeText(content: string | undefined) {
    return content?.replace(/\r\n/g, '\n').trim() ?? '';
  }

  private normalizeTitle(title: string | null | undefined) {
    const normalizedTitle = title?.trim();

    return normalizedTitle ? normalizedTitle.slice(0, 512) : null;
  }
}

type IndexableDocument = Awaited<
  ReturnType<AiExtractedDocumentService['requireIndexableDocument']>
>;
