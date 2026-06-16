import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { FileStorageService, PrismaService } from '@libs/shared';
import {
  AiModelType,
  ChunkStatus,
  DocumentStatus,
  KnowledgeBaseStatus,
} from '@libs/shared/generated/prisma/enums';
import { Prisma } from '@libs/shared/generated/prisma/client';
import type {
  KnowledgeUsageChunkItem,
  KnowledgeUsageDocumentItem,
  KnowledgeUsageRange,
  KnowledgeUsageSummary,
} from '@zeta/common/knowledge-bases';
import { DocumentProcessingJobService } from '../knowledge-docs/document-processing-job.service';
import { knowledgeBaseSelect } from './knowledge-bases.select';

type KnowledgeBaseInput = {
  name?: string;
  description?: string | null;
  status?: KnowledgeBaseStatus;
  embeddingModelId?: string;
  visionModelId?: string | null;
  rerankerModelId?: string | null;
  imageUnderstandingPrompt?: string | null;
  chunkSize?: number;
  chunkOverlap?: number;
};

const KNOWLEDGE_USAGE_RANGE_DAYS = {
  '7d': 7,
  '30d': 30,
} as const satisfies Partial<Record<KnowledgeUsageRange, number>>;

@Injectable()
export class KnowledgeBasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorageService: FileStorageService,
    @Optional()
    private readonly documentProcessingJobService?: DocumentProcessingJobService,
  ) {}

  async list() {
    return this.prisma.knowledgeBase.findMany({
      orderBy: { updatedAt: 'desc' },
      select: knowledgeBaseSelect,
    });
  }

  async get(id: string) {
    await this.requireKnowledgeBase(id);

    return this.prisma.knowledgeBase.findUnique({
      where: { id },
      select: knowledgeBaseSelect,
    });
  }

  async getUsage(
    id: string,
    range: KnowledgeUsageRange = '30d',
  ): Promise<KnowledgeUsageSummary> {
    await this.requireKnowledgeBase(id);
    this.validateUsageRange(range);
    const rangeStart = this.getUsageRangeStart(range);
    const where: Prisma.ChatCitationWhereInput = {
      document: { knowledgeBaseId: id },
    };

    if (rangeStart) {
      where.createdAt = { gte: rangeStart };
    }

    const [citations, activeChunks] = await Promise.all([
      this.prisma.chatCitation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          document: {
            select: {
              id: true,
              name: true,
              sourceType: true,
            },
          },
          chunk: {
            select: {
              id: true,
              documentId: true,
              title: true,
              position: true,
              content: true,
            },
          },
        },
      }),
      this.prisma.chunk.findMany({
        where: {
          knowledgeBaseId: id,
          status: ChunkStatus.ACTIVE,
        },
        select: {
          id: true,
          documentId: true,
        },
      }),
    ]);

    const documentMap = new Map<
      string,
      KnowledgeUsageDocumentItem & { chunkIds: Set<string> }
    >();
    const chunkMap = new Map<string, KnowledgeUsageChunkItem>();
    const documentChunkCounts = new Map<string, number>();
    let lastCitedAt: string | null = null;

    for (const chunk of activeChunks) {
      documentChunkCounts.set(
        chunk.documentId,
        (documentChunkCounts.get(chunk.documentId) ?? 0) + 1,
      );
    }

    for (const citation of citations) {
      const citedAt = citation.createdAt.toISOString();
      const document = citation.document;
      const chunk = citation.chunk;

      if (!lastCitedAt || citedAt > lastCitedAt) {
        lastCitedAt = citedAt;
      }

      const documentUsage = documentMap.get(document.id) ?? {
        documentId: document.id,
        documentName: document.name,
        sourceType: document.sourceType,
        citationCount: 0,
        chunkCount: documentChunkCounts.get(document.id) ?? 0,
        citedChunkCount: 0,
        chunkCoverageRate: 0,
        lastCitedAt: citedAt,
        chunkIds: new Set<string>(),
      };
      documentUsage.citationCount += 1;
      documentUsage.chunkIds.add(chunk.id);

      if (citedAt > documentUsage.lastCitedAt) {
        documentUsage.lastCitedAt = citedAt;
      }

      documentMap.set(document.id, documentUsage);

      const chunkUsage = chunkMap.get(chunk.id) ?? {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        documentName: document.name,
        chunkPosition: chunk.position,
        title: chunk.title,
        preview: this.toUsagePreview(chunk.content),
        citationCount: 0,
        lastCitedAt: citedAt,
      };
      chunkUsage.citationCount += 1;

      if (citedAt > chunkUsage.lastCitedAt) {
        chunkUsage.lastCitedAt = citedAt;
      }

      chunkMap.set(chunk.id, chunkUsage);
    }

    const topDocuments = Array.from(documentMap.values())
      .map(({ chunkIds, ...item }) => ({
        ...item,
        citedChunkCount: chunkIds.size,
        chunkCoverageRate: this.toCoverageRate(chunkIds.size, item.chunkCount),
      }))
      .sort((left, right) => this.compareUsageItems(left, right));

    const topChunks = Array.from(chunkMap.values()).sort((left, right) =>
      this.compareUsageItems(left, right),
    );

    return {
      range,
      totalCitations: citations.length,
      totalChunkCount: activeChunks.length,
      citedDocumentCount: documentMap.size,
      citedChunkCount: chunkMap.size,
      chunkCoverageRate: this.toCoverageRate(
        chunkMap.size,
        activeChunks.length,
      ),
      lastCitedAt,
      topDocuments,
      topChunks,
    };
  }

  async create(input: KnowledgeBaseInput) {
    const data = await this.createData(input);

    return this.prisma.knowledgeBase.create({
      data,
      select: knowledgeBaseSelect,
    });
  }

  async update(id: string, input: KnowledgeBaseInput) {
    const knowledgeBase = await this.requireKnowledgeBase(id);
    const data = await this.updateData(input, knowledgeBase.metadata);

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'at least one knowledge base field is required',
      );
    }

    const nextEmbeddingModelId = input.embeddingModelId?.trim();
    const shouldRebuildEmbeddings =
      nextEmbeddingModelId !== undefined &&
      nextEmbeddingModelId !== knowledgeBase.embeddingModelId;

    const updated = await this.prisma.knowledgeBase.update({
      where: { id },
      data,
      select: knowledgeBaseSelect,
    });

    if (shouldRebuildEmbeddings) {
      await this.queueKnowledgeBaseDocumentEmbeddings(id);
    }

    return updated;
  }

  async reindex(id: string) {
    await this.requireKnowledgeBase(id);
    await this.queueKnowledgeBaseDocumentEmbeddings(id);

    return { id };
  }

  async remove(id: string) {
    await this.requireKnowledgeBase(id);
    let sourceFileIds: string[] = [];

    await this.prisma.$transaction(async (prisma) => {
      const [documents, chunks] = await Promise.all([
        prisma.document.findMany({
          where: { knowledgeBaseId: id },
          select: { id: true, sourceFileId: true, metadata: true },
        }),
        prisma.chunk.findMany({
          where: { knowledgeBaseId: id },
          select: { id: true },
        }),
      ]);
      const documentIds = documents.map((document) => document.id);
      const chunkIds = chunks.map((chunk) => chunk.id);
      sourceFileIds = [
        ...new Set(
          documents
            .flatMap((document) => [
              document.sourceFileId,
              ...this.getDocumentAssetFileIds(document.metadata),
            ])
            .filter((fileId): fileId is string => Boolean(fileId)),
        ),
      ];

      if (documentIds.length > 0 || chunkIds.length > 0) {
        await prisma.chatCitation.deleteMany({
          where: {
            OR: [
              ...(documentIds.length > 0
                ? [{ documentId: { in: documentIds } }]
                : []),
              ...(chunkIds.length > 0 ? [{ chunkId: { in: chunkIds } }] : []),
            ],
          },
        });
      }

      if (chunkIds.length > 0) {
        await prisma.chunkEmbedding.deleteMany({
          where: { chunkId: { in: chunkIds } },
        });
      }

      await prisma.chunk.deleteMany({ where: { knowledgeBaseId: id } });
      await prisma.document.deleteMany({ where: { knowledgeBaseId: id } });
      await prisma.agentKnowledgeBase.deleteMany({
        where: { knowledgeBaseId: id },
      });
      await prisma.knowledgeBase.delete({ where: { id } });
    });

    await this.fileStorageService.removeFilesIfUnreferenced(sourceFileIds);

    return { id };
  }

  private getDocumentAssetFileIds(metadata: Prisma.JsonValue) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return [];
    }

    const assets = (metadata as Record<string, Prisma.JsonValue>).assets;

    if (!Array.isArray(assets)) {
      return [];
    }

    return assets
      .map((asset) => {
        if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
          return null;
        }

        const fileId = (asset as Record<string, Prisma.JsonValue>).fileId;

        return typeof fileId === 'string' ? fileId : null;
      })
      .filter((fileId): fileId is string => Boolean(fileId));
  }

  private async createData(
    input: KnowledgeBaseInput,
  ): Promise<Prisma.KnowledgeBaseCreateInput> {
    const name = input.name?.trim();
    const embeddingModelId = input.embeddingModelId?.trim();
    const chunkSize = input.chunkSize ?? 800;
    const chunkOverlap = input.chunkOverlap ?? 100;

    if (!name || !embeddingModelId) {
      throw new BadRequestException('name and embeddingModelId are required');
    }

    if (
      input.status !== undefined &&
      !this.isKnowledgeBaseStatus(input.status)
    ) {
      throw new BadRequestException('status is invalid');
    }

    this.validateChunkConfig(chunkSize, chunkOverlap);
    await this.requireEmbeddingModel(embeddingModelId);

    return {
      name,
      description: input.description?.trim() || null,
      status: input.status ?? KnowledgeBaseStatus.ACTIVE,
      embeddingModel: { connect: { id: embeddingModelId } },
      ...(await this.createVisionModelData(input.visionModelId)),
      ...(await this.createRerankerModelData(input.rerankerModelId)),
      chunkSize,
      chunkOverlap,
      metadata: this.createMetadata(input.imageUnderstandingPrompt),
    };
  }

  private async updateData(
    input: KnowledgeBaseInput,
    currentMetadata: Prisma.JsonValue,
  ): Promise<Prisma.KnowledgeBaseUpdateInput> {
    const data: Prisma.KnowledgeBaseUpdateInput = {};
    const chunkSize = input.chunkSize;
    const chunkOverlap = input.chunkOverlap;

    if (input.name !== undefined) {
      const name = input.name.trim();

      if (!name) {
        throw new BadRequestException('name cannot be empty');
      }

      data.name = name;
    }

    if (input.description !== undefined) {
      data.description = input.description?.trim() || null;
    }

    if (input.status !== undefined) {
      if (!this.isKnowledgeBaseStatus(input.status)) {
        throw new BadRequestException('status is invalid');
      }

      data.status = input.status;
    }

    if (input.embeddingModelId !== undefined) {
      const embeddingModelId = input.embeddingModelId.trim();

      if (!embeddingModelId) {
        throw new BadRequestException('embeddingModelId cannot be empty');
      }

      await this.requireEmbeddingModel(embeddingModelId);
      data.embeddingModel = { connect: { id: embeddingModelId } };
    }

    if (input.visionModelId !== undefined) {
      data.visionModel = await this.toVisionModelUpdate(input.visionModelId);
    }

    if (input.rerankerModelId !== undefined) {
      data.rerankerModel = await this.toRerankerModelUpdate(
        input.rerankerModelId,
      );
    }

    if (input.imageUnderstandingPrompt !== undefined) {
      data.metadata = this.updateMetadata(
        currentMetadata,
        input.imageUnderstandingPrompt,
      );
    }

    if (chunkSize !== undefined || chunkOverlap !== undefined) {
      if (chunkSize === undefined || chunkOverlap === undefined) {
        throw new BadRequestException(
          'chunkSize and chunkOverlap must be updated together',
        );
      }

      this.validateChunkConfig(chunkSize, chunkOverlap);
      data.chunkSize = chunkSize;
      data.chunkOverlap = chunkOverlap;
    }

    return data;
  }

  private createMetadata(imageUnderstandingPrompt: string | null | undefined) {
    const prompt = imageUnderstandingPrompt?.trim();

    return prompt ? { imageUnderstandingPrompt: prompt } : {};
  }

  private updateMetadata(
    currentMetadata: Prisma.JsonValue,
    imageUnderstandingPrompt: string | null | undefined,
  ): Prisma.InputJsonValue {
    const metadata =
      currentMetadata &&
      typeof currentMetadata === 'object' &&
      !Array.isArray(currentMetadata)
        ? { ...(currentMetadata as Record<string, Prisma.JsonValue>) }
        : {};
    const prompt = imageUnderstandingPrompt?.trim();

    if (prompt) {
      metadata.imageUnderstandingPrompt = prompt;
    } else {
      delete metadata.imageUnderstandingPrompt;
    }

    return metadata;
  }

  private async createVisionModelData(
    visionModelId: string | null | undefined,
  ): Promise<Pick<Prisma.KnowledgeBaseCreateInput, 'visionModel'>> {
    if (!visionModelId) {
      return {};
    }

    const normalizedVisionModelId = visionModelId.trim();

    if (!normalizedVisionModelId) {
      return {};
    }

    await this.requireVisionModel(normalizedVisionModelId);

    return { visionModel: { connect: { id: normalizedVisionModelId } } };
  }

  private async createRerankerModelData(
    rerankerModelId: string | null | undefined,
  ): Promise<Pick<Prisma.KnowledgeBaseCreateInput, 'rerankerModel'>> {
    if (!rerankerModelId) {
      return {};
    }

    const normalizedRerankerModelId = rerankerModelId.trim();

    if (!normalizedRerankerModelId) {
      return {};
    }

    await this.requireRerankerModel(normalizedRerankerModelId);

    return { rerankerModel: { connect: { id: normalizedRerankerModelId } } };
  }

  private async toVisionModelUpdate(
    visionModelId: string | null,
  ): Promise<Prisma.KnowledgeBaseUpdateInput['visionModel']> {
    if (visionModelId === null) {
      return { disconnect: true };
    }

    const normalizedVisionModelId = visionModelId.trim();

    if (!normalizedVisionModelId) {
      return { disconnect: true };
    }

    await this.requireVisionModel(normalizedVisionModelId);

    return { connect: { id: normalizedVisionModelId } };
  }

  private async toRerankerModelUpdate(
    rerankerModelId: string | null,
  ): Promise<Prisma.KnowledgeBaseUpdateInput['rerankerModel']> {
    if (rerankerModelId === null) {
      return { disconnect: true };
    }

    const normalizedRerankerModelId = rerankerModelId.trim();

    if (!normalizedRerankerModelId) {
      return { disconnect: true };
    }

    await this.requireRerankerModel(normalizedRerankerModelId);

    return { connect: { id: normalizedRerankerModelId } };
  }

  private validateChunkConfig(chunkSize: number, chunkOverlap: number) {
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
      throw new BadRequestException('chunkSize must be a positive integer');
    }

    if (
      !Number.isInteger(chunkOverlap) ||
      chunkOverlap < 0 ||
      chunkOverlap >= chunkSize
    ) {
      throw new BadRequestException(
        'chunkOverlap must be a non-negative integer smaller than chunkSize',
      );
    }
  }

  private validateUsageRange(
    range: string,
  ): asserts range is KnowledgeUsageRange {
    if (!['7d', '30d', 'all'].includes(range)) {
      throw new BadRequestException('usage range is invalid');
    }
  }

  private getUsageRangeStart(range: KnowledgeUsageRange) {
    const days =
      range === 'all' ? undefined : KNOWLEDGE_USAGE_RANGE_DAYS[range];

    if (!days) {
      return null;
    }

    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  private toUsagePreview(content: string) {
    return content.replace(/\s+/g, ' ').trim().slice(0, 160);
  }

  private compareUsageItems(
    left: { citationCount: number; lastCitedAt: string },
    right: { citationCount: number; lastCitedAt: string },
  ) {
    return (
      right.citationCount - left.citationCount ||
      right.lastCitedAt.localeCompare(left.lastCitedAt)
    );
  }

  private toCoverageRate(citedCount: number, totalCount: number) {
    if (totalCount <= 0) {
      return 0;
    }

    return Math.min(1, citedCount / totalCount);
  }

  private async requireKnowledgeBase(id: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id },
      select: { id: true, metadata: true, embeddingModelId: true },
    });

    if (!knowledgeBase) {
      throw new NotFoundException('knowledge base does not exist');
    }

    return knowledgeBase;
  }

  private async queueKnowledgeBaseDocumentEmbeddings(knowledgeBaseId: string) {
    if (!this.documentProcessingJobService) {
      throw new Error('document processing queue is not configured');
    }

    const documents = await this.prisma.document.findMany({
      where: {
        knowledgeBaseId,
        chunkCount: { gt: 0 },
      },
      select: { id: true },
    });

    for (const document of documents) {
      const embeddingDocument = await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.EMBEDDING, errorMessage: null },
        select: { updatedAt: true },
      });

      try {
        await this.documentProcessingJobService.enqueueDocumentEmbedding({
          documentId: document.id,
          knowledgeBaseId,
          requestedAt: embeddingDocument.updatedAt.toISOString(),
        });
      } catch (cause) {
        await this.prisma.document.update({
          where: { id: document.id },
          data: {
            status: DocumentStatus.FAILED,
            errorMessage:
              cause instanceof Error
                ? cause.message
                : 'document indexing failed',
          },
        });

        throw cause;
      }
    }
  }

  private async requireEmbeddingModel(id: string) {
    const model = await this.prisma.aiModel.findFirst({
      where: {
        id,
        type: AiModelType.EMBEDDING,
        isEnabled: true,
      },
      select: { id: true },
    });

    if (!model) {
      throw new BadRequestException(
        'embeddingModelId must point to an enabled embedding model',
      );
    }
  }

  private async requireVisionModel(id: string) {
    const model = await this.prisma.aiModel.findFirst({
      where: {
        id,
        type: AiModelType.IMAGE,
        isEnabled: true,
      },
      select: { id: true },
    });

    if (!model) {
      throw new BadRequestException(
        'visionModelId must point to an enabled vision model',
      );
    }
  }

  private async requireRerankerModel(id: string) {
    const model = await this.prisma.aiModel.findFirst({
      where: {
        id,
        type: AiModelType.RERANKER,
        isEnabled: true,
      },
      select: { id: true },
    });

    if (!model) {
      throw new BadRequestException(
        'rerankerModelId must point to an enabled reranker model',
      );
    }
  }

  private isKnowledgeBaseStatus(value: unknown): value is KnowledgeBaseStatus {
    return Object.values(KnowledgeBaseStatus).includes(
      value as KnowledgeBaseStatus,
    );
  }
}
