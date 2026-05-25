import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FileStorageService, PrismaService } from '@libs/shared';
import {
  AiModelType,
  KnowledgeBaseStatus,
} from '@libs/shared/generated/prisma/enums';
import { Prisma } from '@libs/shared/generated/prisma/client';
import { knowledgeBaseSelect } from './knowledge-bases.select';

type KnowledgeBaseInput = {
  name?: string;
  description?: string | null;
  status?: KnowledgeBaseStatus;
  embeddingModelId?: string;
  chunkSize?: number;
  chunkOverlap?: number;
};

@Injectable()
export class KnowledgeBasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorageService: FileStorageService,
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

  async create(input: KnowledgeBaseInput) {
    const data = await this.createData(input);

    return this.prisma.knowledgeBase.create({
      data,
      select: knowledgeBaseSelect,
    });
  }

  async update(id: string, input: KnowledgeBaseInput) {
    await this.requireKnowledgeBase(id);
    const data = await this.updateData(input);

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'at least one knowledge base field is required',
      );
    }

    return this.prisma.knowledgeBase.update({
      where: { id },
      data,
      select: knowledgeBaseSelect,
    });
  }

  async remove(id: string) {
    await this.requireKnowledgeBase(id);
    let sourceFileIds: string[] = [];

    await this.prisma.$transaction(async (prisma) => {
      const [documents, chunks] = await Promise.all([
        prisma.document.findMany({
          where: { knowledgeBaseId: id },
          select: { id: true, sourceFileId: true },
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
            .map((document) => document.sourceFileId)
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
      chunkSize,
      chunkOverlap,
    };
  }

  private async updateData(
    input: KnowledgeBaseInput,
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

  private async requireKnowledgeBase(id: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!knowledgeBase) {
      throw new NotFoundException('knowledge base does not exist');
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

  private isKnowledgeBaseStatus(value: unknown): value is KnowledgeBaseStatus {
    return Object.values(KnowledgeBaseStatus).includes(
      value as KnowledgeBaseStatus,
    );
  }
}
