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
    expect(providers.map((provider) => provider.value)).toEqual([
      'aliyun-bailian',
      'deepseek',
      'openai-compatible',
    ]);

    const aliyunProvider = providers.find(
      (provider) => provider.value === 'aliyun-bailian',
    );
    const deepseekProvider = providers.find(
      (provider) => provider.value === 'deepseek',
    );
    const openAiCompatibleProvider = providers.find(
      (provider) => provider.value === 'openai-compatible',
    );

    expect(aliyunProvider).toMatchObject({
      value: 'aliyun-bailian',
      label: '阿里云百炼',
      icon: 'aliyun-bailian',
      defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      supportedTypes: [
        AiModelType.CHAT,
        AiModelType.EMBEDDING,
        AiModelType.RERANKER,
        AiModelType.IMAGE,
      ],
    });
    expect(deepseekProvider).toMatchObject({
      value: 'deepseek',
      label: 'DeepSeek',
      icon: 'deepseek',
      defaultBaseUrl: 'https://api.deepseek.com',
      supportedTypes: [AiModelType.CHAT],
    });
    expect(openAiCompatibleProvider).toMatchObject({
      value: 'openai-compatible',
      label: 'OpenAI Compatible',
      icon: 'openai-compatible',
      defaultBaseUrl: 'https://api.openai.com/v1',
      supportedTypes: [
        AiModelType.CHAT,
        AiModelType.EMBEDDING,
        AiModelType.IMAGE,
      ],
    });
  });

  it('lists supported model types for a provider', () => {
    const service = createService();

    expect(service.listCatalogTypes('aliyun-bailian')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: AiModelType.CHAT,
          label: '大语言模型',
        }),
        expect.objectContaining({
          value: AiModelType.EMBEDDING,
          label: '向量模型',
        }),
        expect.objectContaining({
          value: AiModelType.RERANKER,
          label: '重排模型',
        }),
        expect.objectContaining({
          value: AiModelType.IMAGE,
          label: '视觉模型',
        }),
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
          defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-api/v1',
        }),
      ]),
    );

    expect(
      service.listCatalogModels('aliyun-bailian', AiModelType.IMAGE),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 'qwen-vl-max',
          label: 'qwen-vl-max',
          defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
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

  it('rejects creating models for providers outside the catalog', async () => {
    const aiModelCreate = jest.fn();
    const service = createService({
      aiModel: {
        create: aiModelCreate,
      },
    });

    await expect(
      service.create({
        name: '未知供应商模型',
        provider: 'missing-provider',
        type: AiModelType.CHAT,
        modelName: 'custom-chat-model',
        baseUrl: 'https://example.com/v1',
        apiKey: 'sk-test',
        isEnabled: true,
        configJson: {},
      }),
    ).rejects.toThrow(BadRequestException);

    expect(aiModelCreate).not.toHaveBeenCalled();
  });

  it('rejects creating unsupported model types for a provider', async () => {
    const aiModelCreate = jest.fn();
    const service = createService({
      aiModel: {
        create: aiModelCreate,
      },
    });

    await expect(
      service.create({
        name: 'DeepSeek 向量模型',
        provider: 'deepseek',
        type: AiModelType.EMBEDDING,
        modelName: 'deepseek-embedding',
        baseUrl: 'https://api.deepseek.com',
        apiKey: 'sk-test',
        isEnabled: true,
        configJson: {},
      }),
    ).rejects.toThrow(BadRequestException);

    expect(aiModelCreate).not.toHaveBeenCalled();
  });

  it('rejects updating to a provider that does not support the existing type', async () => {
    const aiModelUpdate = jest.fn();
    const service = createService({
      aiModel: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            id: 'model-1',
            provider: 'aliyun-bailian',
            type: AiModelType.EMBEDDING,
          }),
        ),
        update: aiModelUpdate,
      },
    });

    await expect(
      service.update('model-1', {
        provider: 'deepseek',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(aiModelUpdate).not.toHaveBeenCalled();
  });
});
