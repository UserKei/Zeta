import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmbeddingService, RerankService } from '@libs/model-adapters';
import { PrismaService } from '../prisma/prisma.service';
import { AiModelType, KnowledgeBaseStatus } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import type {
  RetrievalHit,
  RetrievalMatchReason,
  RetrievalResult,
} from '@zeta/common/knowledge-docs';

type VectorRetrievalRow = {
  chunk_id: string;
  document_id: string;
  document_name: string;
  title: string | null;
  content: string;
  position: number;
  char_count: number;
  vector_score: number | string;
};

type KeywordRetrievalRow = {
  chunk_id: string;
  document_id: string;
  document_name: string;
  title: string | null;
  content: string;
  position: number;
  char_count: number;
  keyword_score: number | string;
};

type RetrievalCandidate = {
  chunkId: string;
  documentId: string;
  documentName: string;
  title: string | null;
  content: string;
  position: number;
  charCount: number;
  vectorScore: number | null;
  keywordScore: number | null;
};

const DEFAULT_RETRIEVAL_TOP_K = 5;
const MAX_RETRIEVAL_TOP_K = 20;
const RETRIEVAL_CANDIDATE_MULTIPLIER = 2;
const RERANK_MIN_CANDIDATE_LIMIT = 20;
const RERANK_MAX_CANDIDATE_LIMIT = 50;
const RERANK_CANDIDATE_MULTIPLIER = 4;
const VECTOR_SCORE_WEIGHT = 0.7;
const KEYWORD_SCORE_WEIGHT = 0.3;

@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly rerankService: RerankService,
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
    const rerankerModel = this.getRetrievableRerankerModel(knowledgeBase);
    const hits = await this.retrieveWithKnowledgeBase(
      knowledgeBase.id,
      embeddingModel,
      rerankerModel,
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
          const rerankerModel = this.getRetrievableRerankerModel(knowledgeBase);

          return this.retrieveWithKnowledgeBase(
            knowledgeBase.id,
            embeddingModel,
            rerankerModel,
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
    rerankerModel: {
      id: string;
      modelName: string;
      baseUrl: string | null;
      apiKey: string | null;
      configJson: Prisma.JsonValue;
    } | null,
    question: string,
    topK: number,
  ) {
    const [queryEmbedding] = await this.embeddingService.embedTexts(
      embeddingModel,
      [question],
    );

    if (!queryEmbedding) {
      throw new BadRequestException('embedding provider returned empty data');
    }

    const candidateLimit = rerankerModel
      ? this.getRerankCandidateLimit(topK)
      : topK * RETRIEVAL_CANDIDATE_MULTIPLIER;
    const [vectorRows, keywordRows] = await Promise.all([
      this.searchByVector(
        knowledgeBaseId,
        embeddingModel.id,
        queryEmbedding,
        candidateLimit,
      ),
      this.searchByKeyword(knowledgeBaseId, question, candidateLimit),
    ]);

    const hits = this.mergeRetrievalRows(vectorRows, keywordRows);

    if (!rerankerModel || hits.length === 0) {
      return hits.slice(0, topK);
    }

    const results = await this.rerankService.rerankDocuments(rerankerModel, {
      query: question,
      documents: hits.map((hit) =>
        hit.title ? `${hit.title}\n${hit.content}` : hit.content,
      ),
      topN: Math.min(topK, hits.length),
    });

    return results.map((result) => {
      const hit = hits[result.index];
      const rerankScore = this.normalizeScore(result.score);

      return {
        ...hit,
        score: rerankScore,
        finalScore: rerankScore,
        rerankScore,
      };
    });
  }

  private async searchByVector(
    knowledgeBaseId: string,
    embeddingModelId: string,
    embedding: number[],
    topK: number,
  ) {
    const vector = this.toVectorLiteral(embedding);

    return this.prisma.$queryRaw<VectorRetrievalRow[]>`
      SELECT
        c."id" AS chunk_id,
        d."id" AS document_id,
        d."name" AS document_name,
        c."title",
        c."content",
        c."position",
        c."char_count",
        1 - (ce."embedding" <=> ${vector}::vector) AS vector_score
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

  private async searchByKeyword(
    knowledgeBaseId: string,
    question: string,
    topK: number,
  ) {
    return this.prisma.$queryRaw<KeywordRetrievalRow[]>`
      WITH query AS (
        SELECT websearch_to_tsquery('simple', ${question}) AS value
      )
      SELECT
        c."id" AS chunk_id,
        d."id" AS document_id,
        d."name" AS document_name,
        c."title",
        c."content",
        c."position",
        c."char_count",
        ts_rank_cd(c."search_vector", query.value, 32) AS keyword_score
      FROM "chunks" c
      INNER JOIN "documents" d ON d."id" = c."document_id"
      CROSS JOIN query
      WHERE c."knowledge_base_id" = ${knowledgeBaseId}::uuid
        AND c."status" = 'ACTIVE'
        AND d."status" = 'INDEXED'
        AND c."search_vector" IS NOT NULL
        AND numnode(query.value) > 0
        AND c."search_vector" @@ query.value
      ORDER BY keyword_score DESC
      LIMIT ${topK}
    `;
  }

  private mergeRetrievalRows(
    vectorRows: VectorRetrievalRow[],
    keywordRows: KeywordRetrievalRow[],
  ) {
    const candidates = new Map<string, RetrievalCandidate>();

    for (const row of vectorRows) {
      candidates.set(row.chunk_id, {
        chunkId: row.chunk_id,
        documentId: row.document_id,
        documentName: row.document_name,
        title: row.title,
        content: row.content,
        position: row.position,
        charCount: row.char_count,
        vectorScore: this.normalizeScore(row.vector_score),
        keywordScore: null,
      });
    }

    for (const row of keywordRows) {
      const candidate = candidates.get(row.chunk_id);
      const keywordScore = this.normalizeScore(row.keyword_score);

      if (candidate) {
        candidate.keywordScore = keywordScore;
        continue;
      }

      candidates.set(row.chunk_id, {
        chunkId: row.chunk_id,
        documentId: row.document_id,
        documentName: row.document_name,
        title: row.title,
        content: row.content,
        position: row.position,
        charCount: row.char_count,
        vectorScore: null,
        keywordScore,
      });
    }

    return [...candidates.values()]
      .map((candidate) => this.toHit(candidate))
      .sort((left, right) => right.score - left.score);
  }

  private toHit(candidate: RetrievalCandidate): RetrievalHit {
    const finalScore = this.calculateFinalScore(
      candidate.vectorScore,
      candidate.keywordScore,
    );

    return {
      chunkId: candidate.chunkId,
      documentId: candidate.documentId,
      documentName: candidate.documentName,
      title: candidate.title,
      content: candidate.content,
      position: candidate.position,
      charCount: candidate.charCount,
      score: finalScore,
      vectorScore: candidate.vectorScore,
      keywordScore: candidate.keywordScore,
      rerankScore: null,
      finalScore,
      matchReason: this.getMatchReason(
        candidate.vectorScore,
        candidate.keywordScore,
      ),
    };
  }

  private calculateFinalScore(
    vectorScore: number | null,
    keywordScore: number | null,
  ) {
    return this.normalizeScore(
      (vectorScore ?? 0) * VECTOR_SCORE_WEIGHT +
        (keywordScore ?? 0) * KEYWORD_SCORE_WEIGHT,
    );
  }

  private getMatchReason(
    vectorScore: number | null,
    keywordScore: number | null,
  ): RetrievalMatchReason {
    if (vectorScore !== null && keywordScore !== null) {
      return 'HYBRID';
    }

    return vectorScore !== null ? 'VECTOR' : 'KEYWORD';
  }

  private normalizeScore(value: number | string) {
    const score = Number(value);

    if (!Number.isFinite(score)) {
      return 0;
    }

    return Math.min(Math.max(score, 0), 1);
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

  private getRerankCandidateLimit(topK: number) {
    return Math.min(
      RERANK_MAX_CANDIDATE_LIMIT,
      Math.max(RERANK_MIN_CANDIDATE_LIMIT, topK * RERANK_CANDIDATE_MULTIPLIER),
    );
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
        rerankerModel: {
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

  private getRetrievableRerankerModel(
    knowledgeBase: Awaited<
      ReturnType<RetrievalService['requireRetrievableKnowledgeBase']>
    >,
  ) {
    if (!knowledgeBase.rerankerModel) {
      return null;
    }

    if (
      knowledgeBase.rerankerModel.type !== AiModelType.RERANKER ||
      !knowledgeBase.rerankerModel.isEnabled
    ) {
      throw new BadRequestException(
        'knowledge base reranker model must be enabled',
      );
    }

    return knowledgeBase.rerankerModel;
  }
}
