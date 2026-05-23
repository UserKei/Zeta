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
import type {
  ManualDocumentPayload,
  RetrievalTestPayload,
} from '@zeta/common/knowledge-docs';
import { chunkSelect, documentSelect } from './knowledge-docs.select';

type ChunkDraft = {
  id: string;
  content: string;
  position: number;
  charCount: number;
  startOffset: number;
  endOffset: number;
};

const MAX_MANUAL_CONTENT_LENGTH = 200_000;

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
    const content = this.normalizeContent(input.content);

    if (!name || !content) {
      throw new BadRequestException('name and content are required');
    }

    if (content.length > MAX_MANUAL_CONTENT_LENGTH) {
      throw new BadRequestException(
        `content cannot exceed ${MAX_MANUAL_CONTENT_LENGTH} characters`,
      );
    }

    const chunks = this.splitContent(
      content,
      knowledgeBase.chunkSize,
      knowledgeBase.chunkOverlap,
    );

    if (chunks.length === 0) {
      throw new BadRequestException('content cannot be split into chunks');
    }

    const document = await this.prisma.document.create({
      data: {
        knowledgeBase: { connect: { id: knowledgeBase.id } },
        name,
        sourceType: DocumentSourceType.MANUAL,
        status: DocumentStatus.CHUNKING,
        charCount: content.length,
        chunkCount: chunks.length,
        metadata: {
          description: input.description?.trim() || null,
        },
      },
      select: documentSelect,
    });

    try {
      await this.createChunks(knowledgeBase.id, document.id, name, chunks);
      await this.refreshSearchVector(document.id);

      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.EMBEDDING, errorMessage: null },
      });

      const embeddings = await this.embeddingService.embedTexts(
        knowledgeBase.embeddingModel,
        chunks.map((chunk) => chunk.content),
      );

      await this.createEmbeddings(
        knowledgeBase.embeddingModel.id,
        chunks,
        embeddings,
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

  async listChunks(documentId: string) {
    await this.requireDocument(documentId);

    return this.prisma.chunk.findMany({
      where: { documentId },
      orderBy: { position: 'asc' },
      select: chunkSelect,
    });
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
    title: string,
    chunks: ChunkDraft[],
  ) {
    await this.prisma.chunk.createMany({
      data: chunks.map((chunk) => ({
        id: chunk.id,
        knowledgeBaseId,
        documentId,
        title,
        content: chunk.content,
        position: chunk.position,
        charCount: chunk.charCount,
        status: ChunkStatus.ACTIVE,
        metadata: {
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
        },
      })),
    });
  }

  private async createEmbeddings(
    embeddingModelId: string,
    chunks: ChunkDraft[],
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

  private async refreshSearchVector(documentId: string) {
    await this.prisma.$executeRaw`
      UPDATE "chunks"
      SET "search_vector" = to_tsvector('simple', "content")
      WHERE "document_id" = ${documentId}::uuid
    `;
  }

  private splitContent(
    content: string,
    chunkSize: number,
    chunkOverlap: number,
  ) {
    const chunks: ChunkDraft[] = [];
    let startOffset = 0;

    while (startOffset < content.length) {
      const endOffset = Math.min(startOffset + chunkSize, content.length);
      const chunkContent = content.slice(startOffset, endOffset).trim();

      if (chunkContent) {
        chunks.push({
          id: randomUUID(),
          content: chunkContent,
          position: chunks.length,
          charCount: chunkContent.length,
          startOffset,
          endOffset,
        });
      }

      if (endOffset >= content.length) {
        break;
      }

      startOffset = Math.max(endOffset - chunkOverlap, startOffset + 1);
    }

    return chunks;
  }

  private normalizeContent(content: string | undefined) {
    return content?.replace(/\r\n/g, '\n').trim() ?? '';
  }

  private toVectorLiteral(embedding: number[]) {
    return `[${embedding.join(',')}]`;
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

  private async requireIndexableKnowledgeBase(id: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
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
      },
    });

    if (!knowledgeBase) {
      throw new NotFoundException('knowledge base does not exist');
    }

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

    return knowledgeBase;
  }
}
