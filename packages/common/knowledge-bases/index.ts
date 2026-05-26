export const KnowledgeBaseStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
} as const;

export type KnowledgeBaseStatus =
  (typeof KnowledgeBaseStatus)[keyof typeof KnowledgeBaseStatus];

export type KnowledgeBasePayload = {
  name: string;
  description?: string | null;
  status?: KnowledgeBaseStatus;
  embeddingModelId: string;
  chunkSize?: number;
  chunkOverlap?: number;
};

export type KnowledgeBaseUpdatePayload = Partial<KnowledgeBasePayload>;
