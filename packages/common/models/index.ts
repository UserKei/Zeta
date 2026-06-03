export const AiModelType = {
  CHAT: "CHAT",
  EMBEDDING: "EMBEDDING",
  RERANKER: "RERANKER",
  IMAGE: "IMAGE",
} as const;

export type AiModelType = (typeof AiModelType)[keyof typeof AiModelType];

export type ModelPayload = {
  name: string;
  provider: string;
  type: AiModelType;
  modelName: string;
  baseUrl: string;
  apiKey: string;
  isEnabled?: boolean;
  configJson?: Record<string, unknown> | null;
};

export type ModelUpdatePayload = Partial<
  Omit<ModelPayload, "baseUrl" | "apiKey">
> & {
  baseUrl?: string | null;
  apiKey?: string | null;
};

export type AiModel = {
  id: string;
  name: string;
  provider: string;
  type: AiModelType;
  modelName: string;
  baseUrl: string | null;
  configJson: Record<string, unknown>;
  apiKeyMasked: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

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
  defaultConfigJson?: Record<string, unknown>;
};
