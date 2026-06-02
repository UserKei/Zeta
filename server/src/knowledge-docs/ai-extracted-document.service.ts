import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@libs/shared';
import {
  AiModelType,
  ChunkStatus,
  DocumentSourceType,
  DocumentStatus,
  KnowledgeBaseStatus,
} from '@libs/shared/generated/prisma/enums';
import type { Prisma } from '@libs/shared/generated/prisma/client';
import { MAX_CHUNK_CONTENT_LENGTH } from './knowledge-docs.constants';
import {
  ChunkIndexingService,
  type EmbeddingModelConfig,
} from './chunk-indexing.service';
import { chunkSelect, documentSelect } from './knowledge-docs.select';

type DocumentRecord = Prisma.DocumentGetPayload<{
  select: typeof documentSelect;
}>;

export type AiExtractedChunkInput = {
  documentId?: string;
  documentName?: string;
  title?: string | null;
  content: string;
  sourceMessageId: string;
};

@Injectable()
export class AiExtractedDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chunkIndexingService: ChunkIndexingService,
  ) {}

  async createChunk(knowledgeBaseId: string, input: AiExtractedChunkInput) {
    await this.requireIndexableKnowledgeBase(knowledgeBaseId);

    const document = input.documentId
      ? await this.requireTargetDocument(knowledgeBaseId, input.documentId)
      : await this.findOrCreateDocument(
          knowledgeBaseId,
          input.documentName,
          input.sourceMessageId,
        );
    const chunk = await this.createActiveChunk(document, input);
    const updatedDocument = await this.prisma.document.findUnique({
      where: { id: document.id },
      select: documentSelect,
    });

    if (!updatedDocument) {
      throw new NotFoundException('document does not exist');
    }

    return {
      document: this.toDocumentResponse(updatedDocument),
      chunk,
    };
  }

  private async createActiveChunk(
    document: IndexableDocument,
    input: AiExtractedChunkInput,
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
    const created = await this.prisma.$transaction(async (tx) => {
      const position = await tx.chunk.count({
        where: { documentId: document.id },
      });

      return tx.chunk.create({
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
    });

    await this.chunkIndexingService.refreshChunkSearchVector(created.id);
    await this.chunkIndexingService.syncChunkEmbedding(
      created.id,
      document.knowledgeBase.embeddingModel,
      created.status,
    );
    await this.chunkIndexingService.refreshDocumentStats(document.id);

    return this.prisma.chunk.findUniqueOrThrow({
      where: { id: created.id },
      select: chunkSelect,
    });
  }

  private async requireTargetDocument(
    knowledgeBaseId: string,
    documentId: string,
  ) {
    const document = await this.requireIndexableDocument(documentId);

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
  ) {
    const name = documentName?.trim() || '聊天补充知识';
    const existingDocument = await this.prisma.document.findFirst({
      where: {
        knowledgeBaseId,
        sourceType: DocumentSourceType.AI_EXTRACTED,
        name,
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    if (existingDocument) {
      return this.requireIndexableDocument(existingDocument.id);
    }

    const document = await this.prisma.document.create({
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

    return this.requireIndexableDocument(document.id);
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

  private async requireIndexableKnowledgeBase(id: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id },
      select: this.indexableKnowledgeBaseSelect,
    });

    if (!knowledgeBase) {
      throw new NotFoundException('knowledge base does not exist');
    }

    return {
      ...knowledgeBase,
      embeddingModel: this.getIndexableEmbeddingModel(knowledgeBase),
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

type IndexableDocument = Awaited<
  ReturnType<AiExtractedDocumentService['requireIndexableDocument']>
>;

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
    | (EmbeddingModelConfig & {
        type: AiModelType;
        isEnabled: boolean;
      })
    | null;
};
