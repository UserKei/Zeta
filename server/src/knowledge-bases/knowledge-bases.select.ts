import { Prisma } from '@libs/shared/generated/prisma/client';

export const knowledgeBaseSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  embeddingModelId: true,
  chunkSize: true,
  chunkOverlap: true,
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
} satisfies Prisma.KnowledgeBaseSelect;
