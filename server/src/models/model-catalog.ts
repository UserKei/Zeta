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
  defaultBaseUrl?: string;
  defaultConfigJson?: Record<string, unknown>;
};

export type ModelCatalogProvider = {
  value: string;
  label: string;
  icon?: string;
  description?: string;
  note?: string;
  defaultBaseUrl?: string;
  supportedTypes: AiModelType[];
  models: ModelCatalogModel[];
  defaultConfigJson?: Record<string, unknown>;
};

export const modelTypes: ModelTypeOption[] = [
  { value: AiModelType.CHAT, label: '对话模型' },
  { value: AiModelType.EMBEDDING, label: '向量模型' },
  { value: AiModelType.RERANKER, label: '重排模型' },
  { value: AiModelType.IMAGE, label: '视觉模型' },
];

export const modelProviders: ModelCatalogProvider[] = [
  {
    value: 'aliyun-bailian',
    label: '阿里云百炼',
    icon: 'aliyun-bailian',
    description: '阿里云百炼模型服务',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
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
        value: 'qwen3-vl-embedding',
        label: 'qwen3-vl-embedding',
        type: AiModelType.EMBEDDING,
        description: '百炼多模态向量模型',
        defaultBaseUrl: 'https://dashscope.aliyuncs.com/api/v1',
        defaultConfigJson: {
          protocol: 'dashscope-multimodal',
          dimension: 1024,
          enableFusion: true,
        },
      },
      {
        value: 'qwen3-rerank',
        label: 'qwen3-rerank',
        type: AiModelType.RERANKER,
        description: '百炼文本重排序模型',
        defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-api/v1',
      },
      {
        value: 'qwen-vl-max',
        label: 'qwen-vl-max',
        type: AiModelType.IMAGE,
        description: '百炼视觉理解模型',
        defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      },
    ],
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    icon: 'deepseek',
    description: 'DeepSeek 对话模型',
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
    icon: 'openai-compatible',
    description: '通用兼容接口',
    note: '适合火山引擎、硅基流动、自部署 OpenAI-compatible 接口等，需自行确认 Base URL 和模型标识。',
    defaultBaseUrl: 'https://api.openai.com/v1',
    supportedTypes: [
      AiModelType.CHAT,
      AiModelType.EMBEDDING,
      AiModelType.IMAGE,
    ],
    models: [
      {
        value: 'gpt-4o-mini',
        label: 'gpt-4o-mini',
        type: AiModelType.CHAT,
        description: 'OpenAI-compatible 对话模型示例',
      },
      {
        value: 'text-embedding-3-small',
        label: 'text-embedding-3-small',
        type: AiModelType.EMBEDDING,
        description: 'OpenAI-compatible 向量模型示例',
      },
      {
        value: 'gpt-4o',
        label: 'gpt-4o',
        type: AiModelType.IMAGE,
        description: 'OpenAI-compatible 视觉模型示例',
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
