import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { AiModelType, KnowledgeBaseStatus } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import type {
  RetrievalHit,
  RetrievalResult,
} from '@zeta/common/knowledge-docs';

type RetrievalRow = {
  chunk_id: string;
  document_id: string;
  document_name: string;
  content: string;
  position: number;
  char_count: number;
  score: number | string;
};

const DEFAULT_RETRIEVAL_TOP_K = 5;
const MAX_RETRIEVAL_TOP_K = 20;

@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async retrieveFromKnowledgeBase(
    knowledgeBaseId: string,
    question: string,
    topK?: number,
  ): Promise<RetrievalResult> {
    const normalizedQuestion = this.normalizeQuestion(question);
    const limit = this.parseTopK(topK);
    const knowledgeBase =
      await this.requireRetrievableKnowledgeBase(knowledgeBaseId);
    const embeddingModel = this.getRetrievableEmbeddingModel(knowledgeBase);
    const hits = await this.retrieveWithKnowledgeBase(
      knowledgeBase.id,
      embeddingModel,
      normalizedQuestion,
      limit,
    );

    return {
      question: normalizedQuestion,
      topK: limit,
      hits,
    };
  }

  async retrieveFromKnowledgeBases(
    knowledgeBaseIds: string[],
    question: string,
    topK?: number,
  ): Promise<RetrievalResult> {
    const normalizedQuestion = this.normalizeQuestion(question);
    const limit = this.parseTopK(topK);
    const uniqueKnowledgeBaseIds = [...new Set(knowledgeBaseIds)];

    if (uniqueKnowledgeBaseIds.length === 0) {
      throw new BadRequestException(
        'agent must bind at least one knowledge base',
      );
    }

    const hits = (
      await Promise.all(
        uniqueKnowledgeBaseIds.map(async (knowledgeBaseId) => {
          const knowledgeBase =
            await this.requireRetrievableKnowledgeBase(knowledgeBaseId);
          const embeddingModel =
            this.getRetrievableEmbeddingModel(knowledgeBase);

          return this.retrieveWithKnowledgeBase(
            knowledgeBase.id,
            embeddingModel,
            normalizedQuestion,
            limit,
          );
        }),
      )
    )
      .flat()
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);

    return {
      question: normalizedQuestion,
      topK: limit,
      hits,
    };
  }

  private async retrieveWithKnowledgeBase(
    knowledgeBaseId: string,
    embeddingModel: {
      id: string;
      modelName: string;
      baseUrl: string | null;
      apiKey: string | null;
      configJson: Prisma.JsonValue;
    },
    question: string,
    topK: number,
  ) {
    const [queryEmbedding] = await this.embeddingService.embedTexts(
      embeddingModel,
      [question],
    );
    const rows = await this.searchByVector(
      knowledgeBaseId,
      embeddingModel.id,
      queryEmbedding,
      topK,
    );

    return rows.map((row) => this.toHit(row));
  }

  private async searchByVector(
    knowledgeBaseId: string,
    embeddingModelId: string,
    embedding: number[],
    topK: number,
  ) {
    const vector = this.toVectorLiteral(embedding);

    return this.prisma.$queryRaw<RetrievalRow[]>`
      SELECT
        c."id" AS chunk_id,
        d."id" AS document_id,
        d."name" AS document_name,
        c."content",
        c."position",
        c."char_count",
        1 - (ce."embedding" <=> ${vector}::vector) AS score
      FROM "chunk_embeddings" ce
      INNER JOIN "chunks" c ON c."id" = ce."chunk_id"
      INNER JOIN "documents" d ON d."id" = c."document_id"
      WHERE c."knowledge_base_id" = ${knowledgeBaseId}::uuid
        AND c."status" = 'ACTIVE'
        AND d."status" = 'INDEXED'
        AND ce."embedding_model_id" = ${embeddingModelId}::uuid
      ORDER BY ce."embedding" <=> ${vector}::vector
      LIMIT ${topK}
    `;
  }

  private toHit(row: RetrievalRow): RetrievalHit {
    return {
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentName: row.document_name,
      content: row.content,
      position: row.position,
      charCount: row.char_count,
      score: Number(row.score),
    };
  }

  private normalizeQuestion(question: string | undefined) {
    const normalizedQuestion = question?.trim();

    if (!normalizedQuestion) {
      throw new BadRequestException('question is required');
    }

    return normalizedQuestion;
  }

  private parseTopK(value: number | undefined) {
    const topK = value ?? DEFAULT_RETRIEVAL_TOP_K;

    if (!Number.isInteger(topK) || topK <= 0 || topK > MAX_RETRIEVAL_TOP_K) {
      throw new BadRequestException(
        `topK must be an integer between 1 and ${MAX_RETRIEVAL_TOP_K}`,
      );
    }

    return topK;
  }

  private toVectorLiteral(embedding: number[]) {
    return `[${embedding.join(',')}]`;
  }

  private async requireRetrievableKnowledgeBase(id: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id },
      select: {
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
      },
    });

    if (!knowledgeBase) {
      throw new NotFoundException('knowledge base does not exist');
    }

    return knowledgeBase;
  }

  private getRetrievableEmbeddingModel(
    knowledgeBase: Awaited<
      ReturnType<RetrievalService['requireRetrievableKnowledgeBase']>
    >,
  ) {
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
}
