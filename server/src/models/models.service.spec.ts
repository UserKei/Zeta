import { BadRequestException } from '@nestjs/common';

jest.mock('@libs/shared', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('@libs/shared/generated/prisma/client', () => ({
  Prisma: {},
}));

jest.mock('@libs/shared/generated/prisma/enums', () => ({
  AiModelType: {
    CHAT: 'CHAT',
    EMBEDDING: 'EMBEDDING',
    RERANKER: 'RERANKER',
    IMAGE: 'IMAGE',
  },
}));

import { AiModelType } from '@libs/shared/generated/prisma/enums';
import { ModelsService } from './models.service';

const now = new Date('2026-06-01T10:00:00.000Z');

const modelRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'model-1',
  name: '自定义模型',
  provider: 'openai-compatible',
  type: AiModelType.CHAT,
  modelName: 'custom-chat-model',
  baseUrl: 'https://example.com/v1',
  configJson: {},
  apiKey: 'sk-test',
  isEnabled: true,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

describe('ModelsService catalog', () => {
  const createService = (prisma: Record<string, unknown> = {}) =>
    new ModelsService(prisma as never);

  it('lists configured model providers', () => {
    const service = createService();

    const providers = service.listCatalogProviders();
    const aliyunProvider = providers.find(
      (provider) => provider.value === 'aliyun-bailian',
    );
    const deepseekProvider = providers.find(
      (provider) => provider.value === 'deepseek',
    );

    expect(aliyunProvider).toMatchObject({
      value: 'aliyun-bailian',
      label: '阿里云百炼',
      defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-api/v1',
    });
    expect(deepseekProvider).toMatchObject({
      value: 'deepseek',
      label: 'DeepSeek',
      defaultBaseUrl: 'https://api.deepseek.com',
    });
  });

  it('lists supported model types for a provider', () => {
    const service = createService();

    expect(service.listCatalogTypes('aliyun-bailian')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: AiModelType.CHAT, label: '对话模型' }),
        expect.objectContaining({ value: AiModelType.EMBEDDING }),
        expect.objectContaining({ value: AiModelType.RERANKER }),
        expect.objectContaining({ value: AiModelType.IMAGE }),
      ]),
    );
  });

  it('lists recommended model ids by provider and type', () => {
    const service = createService();

    expect(
      service.listCatalogModels('aliyun-bailian', AiModelType.RERANKER),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 'qwen3-rerank',
          label: 'qwen3-rerank',
        }),
      ]),
    );
  });

  it('rejects unknown providers in catalog lookups', () => {
    const service = createService();

    expect(() => service.listCatalogTypes('missing-provider')).toThrow(
      BadRequestException,
    );
  });
});

describe('ModelsService custom model names', () => {
  const createService = (prisma: Record<string, unknown>) =>
    new ModelsService(prisma as never);

  it('allows saving a model name not listed in the catalog', async () => {
    let createInput: unknown;
    const aiModelCreate = jest.fn((input: unknown) => {
      createInput = input;
      return Promise.resolve(modelRecord());
    });
    const service = createService({
      aiModel: {
        create: aiModelCreate,
      },
    });

    const result = await service.create({
      name: '自定义模型',
      provider: 'openai-compatible',
      type: AiModelType.CHAT,
      modelName: 'custom-chat-model',
      baseUrl: 'https://example.com/v1',
      apiKey: 'sk-test',
      isEnabled: true,
      configJson: {},
    });

    expect(aiModelCreate).toHaveBeenCalledTimes(1);
    const createArg = createInput as { data: { modelName: string } };

    expect(createArg.data.modelName).toBe('custom-chat-model');
    expect(result.modelName).toBe('custom-chat-model');
  });
});
