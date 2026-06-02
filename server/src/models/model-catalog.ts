import { AiModelType } from '@libs/shared/generated/prisma/enums';

export type ModelTypeOption = {
  value: AiModelType;
  label: string;
};

export type ModelCatalogModel = {
  value: string;
  label: string;
  type: AiModelType;
  description?: string;
  defaultConfigJson?: Record<string, unknown>;
};

export type ModelCatalogProvider = {
  value: string;
  label: string;
  defaultBaseUrl?: string;
  supportedTypes: AiModelType[];
  models: ModelCatalogModel[];
  defaultConfigJson?: Record<string, unknown>;
};

export const modelTypes: ModelTypeOption[] = [
  { value: AiModelType.CHAT, label: '对话模型' },
  { value: AiModelType.EMBEDDING, label: 'Embedding' },
  { value: AiModelType.RERANKER, label: 'Reranker' },
  { value: AiModelType.IMAGE, label: '视觉模型' },
];

export const modelProviders: ModelCatalogProvider[] = [
  {
    value: 'aliyun-bailian',
    label: '阿里云百炼',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-api/v1',
    supportedTypes: [
      AiModelType.CHAT,
      AiModelType.EMBEDDING,
      AiModelType.RERANKER,
      AiModelType.IMAGE,
    ],
    models: [
      {
        value: 'qwen-plus',
        label: 'qwen-plus',
        type: AiModelType.CHAT,
        description: '通用对话模型',
      },
      {
        value: 'qwen-turbo',
        label: 'qwen-turbo',
        type: AiModelType.CHAT,
        description: '轻量对话模型',
      },
      {
        value: 'qwen-max',
        label: 'qwen-max',
        type: AiModelType.CHAT,
        description: '更强推理和生成能力',
      },
      {
        value: 'text-embedding-v4',
        label: 'text-embedding-v4',
        type: AiModelType.EMBEDDING,
        description: '百炼文本向量模型',
        defaultConfigJson: { dimensions: 1024 },
      },
      {
        value: 'qwen3-rerank',
        label: 'qwen3-rerank',
        type: AiModelType.RERANKER,
        description: '百炼文本重排序模型',
      },
      {
        value: 'qwen-vl-max',
        label: 'qwen-vl-max',
        type: AiModelType.IMAGE,
        description: '百炼视觉理解模型',
      },
    ],
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    supportedTypes: [AiModelType.CHAT],
    models: [
      {
        value: 'deepseek-chat',
        label: 'deepseek-chat',
        type: AiModelType.CHAT,
        description: 'DeepSeek 通用对话模型',
      },
      {
        value: 'deepseek-reasoner',
        label: 'deepseek-reasoner',
        type: AiModelType.CHAT,
        description: 'DeepSeek 推理模型',
      },
      {
        value: 'deepseek-v4-flash',
        label: 'deepseek-v4-flash',
        type: AiModelType.CHAT,
        description: 'DeepSeek 低延迟对话模型',
      },
    ],
  },
  {
    value: 'openai-compatible',
    label: 'OpenAI Compatible',
    supportedTypes: [
      AiModelType.CHAT,
      AiModelType.EMBEDDING,
      AiModelType.RERANKER,
      AiModelType.IMAGE,
    ],
    models: [
      {
        value: 'gpt-4.1-mini',
        label: 'gpt-4.1-mini',
        type: AiModelType.CHAT,
        description: 'OpenAI-compatible 对话模型示例',
      },
      {
        value: 'text-embedding-3-small',
        label: 'text-embedding-3-small',
        type: AiModelType.EMBEDDING,
        description: 'OpenAI-compatible 向量模型示例',
      },
    ],
  },
];

export const findModelProvider = (provider: string) =>
  modelProviders.find((item) => item.value === provider) ?? null;

export const getModelTypesByProvider = (provider: string) => {
  const item = findModelProvider(provider);

  if (!item) {
    return [];
  }

  return modelTypes.filter((type) => item.supportedTypes.includes(type.value));
};

export const getModelsByProviderAndType = (
  provider: string,
  type: AiModelType,
) => {
  const item = findModelProvider(provider);

  if (!item) {
    return [];
  }

  return item.models.filter((model) => model.type === type);
};
