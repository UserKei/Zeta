import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@libs/shared';
import { AiModelType } from '@libs/shared/generated/prisma/enums';
import { Prisma } from '@libs/shared/generated/prisma/client';
import {
  findModelProvider,
  getModelsByProviderAndType,
  getModelTypesByProvider,
  modelProviders,
} from './model-catalog';

type ModelInput = {
  name?: string;
  provider?: string;
  type?: AiModelType;
  modelName?: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  isEnabled?: boolean;
  configJson?: Record<string, unknown> | null;
};

const modelSelect = {
  id: true,
  name: true,
  provider: true,
  type: true,
  modelName: true,
  baseUrl: true,
  configJson: true,
  apiKey: true,
  isEnabled: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AiModelSelect;

@Injectable()
export class ModelsService {
  constructor(private readonly prisma: PrismaService) {}

  listCatalogProviders() {
    return modelProviders.map(
      ({
        value,
        label,
        icon,
        description,
        note,
        defaultBaseUrl,
        supportedTypes,
        defaultConfigJson,
      }) => ({
        value,
        label,
        icon,
        description,
        note,
        defaultBaseUrl,
        supportedTypes,
        defaultConfigJson,
      }),
    );
  }

  listCatalogTypes(provider: string) {
    this.requireCatalogProvider(provider);

    return getModelTypesByProvider(provider);
  }

  listCatalogModels(provider: string, type: AiModelType) {
    this.requireCatalogProvider(provider);

    if (!this.isModelType(type)) {
      throw new BadRequestException('type is invalid');
    }

    return getModelsByProviderAndType(provider, type);
  }

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
    const existingModel = await this.requireModel(id);
    const data = this.updateData(input);

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('at least one model field is required');
    }

    const provider =
      typeof data.provider === 'string'
        ? data.provider
        : existingModel.provider;
    const type = this.isModelType(data.type) ? data.type : existingModel.type;
    this.requireProviderSupportsType(provider, type);

    const model = await this.prisma.aiModel.update({
      where: { id },
      data,
      select: modelSelect,
    });

    return this.toResponse(model);
  }

  async remove(id: string) {
    await this.requireModel(id);

    await this.prisma.$transaction([
      this.prisma.chunkEmbedding.deleteMany({
        where: { embeddingModelId: id },
      }),
      this.prisma.aiModel.delete({ where: { id } }),
    ]);

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

    this.requireProviderSupportsType(provider, input.type);

    return {
      name,
      provider,
      type: input.type,
      modelName,
      baseUrl: input.baseUrl?.trim() || null,
      apiKey: input.apiKey?.trim() || null,
      isEnabled: input.isEnabled ?? true,
      configJson: this.normalizeConfigJson(input.configJson),
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

    if (input.configJson !== undefined) {
      data.configJson = this.normalizeConfigJson(input.configJson);
    }

    return data;
  }

  private normalizeConfigJson(
    configJson: ModelInput['configJson'],
  ): Prisma.InputJsonValue {
    if (
      configJson &&
      typeof configJson === 'object' &&
      !Array.isArray(configJson)
    ) {
      return configJson as Prisma.InputJsonObject;
    }

    return {};
  }

  private async requireModel(id: string) {
    const model = await this.prisma.aiModel.findUnique({
      where: { id },
      select: { id: true, provider: true, type: true },
    });

    if (!model) {
      throw new NotFoundException('model does not exist');
    }

    return model;
  }

  private requireCatalogProvider(provider: string) {
    if (!findModelProvider(provider)) {
      throw new BadRequestException('provider is not supported by catalog');
    }
  }

  private requireProviderSupportsType(provider: string, type: AiModelType) {
    const catalogProvider = findModelProvider(provider);

    if (!catalogProvider) {
      throw new BadRequestException('provider is not supported by catalog');
    }

    if (!catalogProvider.supportedTypes.includes(type)) {
      throw new BadRequestException('type is not supported by provider');
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
