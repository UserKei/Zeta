export const AiModelType = {
  CHAT: 'CHAT',
  EMBEDDING: 'EMBEDDING',
  RERANKER: 'RERANKER',
  IMAGE: 'IMAGE',
} as const;

export type AiModelType = (typeof AiModelType)[keyof typeof AiModelType];

export type ModelPayload = {
  name: string;
  provider: string;
  type: AiModelType;
  modelName: string;
  baseUrl?: string | null;
  apiKey?: string | null;
  isEnabled?: boolean;
  configJson?: Record<string, unknown> | null;
};

export type ModelUpdatePayload = Partial<ModelPayload>;
