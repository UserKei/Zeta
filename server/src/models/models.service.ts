import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@libs/shared';
import { AiModelType } from '@libs/shared/generated/prisma/enums';
import { Prisma } from '@libs/shared/generated/prisma/client';

type ModelInput = {
  name?: string;
  provider?: string;
  type?: AiModelType;
  modelName?: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  isEnabled?: boolean;
};

const modelSelect = {
  id: true,
  name: true,
  provider: true,
  type: true,
  modelName: true,
  baseUrl: true,
  apiKey: true,
  isEnabled: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AiModelSelect;

@Injectable()
export class ModelsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const models = await this.prisma.aiModel.findMany({
      orderBy: { updatedAt: 'desc' },
      select: modelSelect,
    });

    return models.map((model) => this.toResponse(model));
  }

  async create(input: ModelInput) {
    const model = await this.prisma.aiModel.create({
      data: this.createData(input),
      select: modelSelect,
    });

    return this.toResponse(model);
  }

  async update(id: string, input: ModelInput) {
    await this.requireModel(id);
    const data = this.updateData(input);

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('at least one model field is required');
    }

    const model = await this.prisma.aiModel.update({
      where: { id },
      data,
      select: modelSelect,
    });

    return this.toResponse(model);
  }

  async remove(id: string) {
    await this.requireModel(id);
    await this.prisma.aiModel.delete({ where: { id } });

    return { id };
  }

  private createData(input: ModelInput): Prisma.AiModelCreateInput {
    const name = input.name?.trim();
    const provider = input.provider?.trim();
    const modelName = input.modelName?.trim();

    if (!name || !provider || !modelName || !this.isModelType(input.type)) {
      throw new BadRequestException(
        'name, provider, type and modelName are required',
      );
    }

    return {
      name,
      provider,
      type: input.type,
      modelName,
      baseUrl: input.baseUrl?.trim() || null,
      apiKey: input.apiKey?.trim() || null,
      isEnabled: input.isEnabled ?? true,
    };
  }

  private updateData(input: ModelInput): Prisma.AiModelUpdateInput {
    const data: Prisma.AiModelUpdateInput = {};

    if (input.name !== undefined) {
      const name = input.name.trim();

      if (!name) {
        throw new BadRequestException('name cannot be empty');
      }

      data.name = name;
    }

    if (input.provider !== undefined) {
      const provider = input.provider.trim();

      if (!provider) {
        throw new BadRequestException('provider cannot be empty');
      }

      data.provider = provider;
    }

    if (input.type !== undefined) {
      if (!this.isModelType(input.type)) {
        throw new BadRequestException('type is invalid');
      }

      data.type = input.type;
    }

    if (input.modelName !== undefined) {
      const modelName = input.modelName.trim();

      if (!modelName) {
        throw new BadRequestException('modelName cannot be empty');
      }

      data.modelName = modelName;
    }

    if (input.baseUrl !== undefined) {
      data.baseUrl = input.baseUrl?.trim() || null;
    }

    if (input.apiKey !== undefined) {
      data.apiKey = input.apiKey?.trim() || null;
    }

    if (input.isEnabled !== undefined) {
      data.isEnabled = input.isEnabled;
    }

    return data;
  }

  private async requireModel(id: string) {
    const model = await this.prisma.aiModel.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!model) {
      throw new NotFoundException('model does not exist');
    }
  }

  private toResponse(
    model: Prisma.AiModelGetPayload<{ select: typeof modelSelect }>,
  ) {
    const { apiKey, ...visibleModel } = model;

    return {
      ...visibleModel,
      apiKeyMasked: apiKey ? '********' : null,
    };
  }

  private isModelType(value: unknown): value is AiModelType {
    return Object.values(AiModelType).includes(value as AiModelType);
  }
}
