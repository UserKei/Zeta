import { Prisma } from '@libs/shared/generated/prisma/client';

export const knowledgeBaseSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  embeddingModelId: true,
  visionModelId: true,
  rerankerModelId: true,
  chunkSize: true,
  chunkOverlap: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  embeddingModel: {
    select: {
      id: true,
      name: true,
      provider: true,
      modelName: true,
      isEnabled: true,
    },
  },
  visionModel: {
    select: {
      id: true,
      name: true,
      provider: true,
      modelName: true,
      isEnabled: true,
    },
  },
  rerankerModel: {
    select: {
      id: true,
      name: true,
      provider: true,
      modelName: true,
      isEnabled: true,
    },
  },
} satisfies Prisma.KnowledgeBaseSelect;
