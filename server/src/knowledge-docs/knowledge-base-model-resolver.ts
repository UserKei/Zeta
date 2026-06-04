import { BadRequestException } from '@nestjs/common';
import {
  AiModelType,
  KnowledgeBaseStatus,
} from '@libs/shared/generated/prisma/enums';
import type { Prisma } from '@libs/shared/generated/prisma/client';
import type { EmbeddingModelConfig } from './chunk-indexing.service';

export type KnowledgeBaseModelConfig = EmbeddingModelConfig & {
  type: AiModelType;
  isEnabled: boolean;
};

export type IndexableKnowledgeBase = {
  id: string;
  status: KnowledgeBaseStatus;
  metadata: Prisma.JsonValue;
  chunkSize: number;
  chunkOverlap: number;
  embeddingModel: KnowledgeBaseModelConfig | null;
  visionModel: KnowledgeBaseModelConfig | null;
};

export type IndexableKnowledgeBaseWithEmbedding = Omit<
  IndexableKnowledgeBase,
  'embeddingModel'
> & {
  embeddingModel: KnowledgeBaseModelConfig;
};

export const indexableKnowledgeBaseSelect = {
  id: true,
  status: true,
  metadata: true,
  chunkSize: true,
  chunkOverlap: true,
  embeddingModel: {
    select: {
      id: true,
      type: true,
      isEnabled: true,
      modelName: true,
      baseUrl: true,
      apiKey: true,
      configJson: true,
    },
  },
  visionModel: {
    select: {
      id: true,
      type: true,
      isEnabled: true,
      modelName: true,
      baseUrl: true,
      apiKey: true,
      configJson: true,
    },
  },
} as const;

export function resolveIndexableEmbeddingModel(
  knowledgeBase: IndexableKnowledgeBase,
) {
  if (knowledgeBase.status !== KnowledgeBaseStatus.ACTIVE) {
    throw new BadRequestException('knowledge base is disabled');
  }

  if (!knowledgeBase.embeddingModel) {
    throw new BadRequestException(
      'knowledge base embedding model is not configured',
    );
  }

  if (
    knowledgeBase.embeddingModel.type !== AiModelType.EMBEDDING ||
    !knowledgeBase.embeddingModel.isEnabled
  ) {
    throw new BadRequestException(
      'knowledge base embedding model must be enabled',
    );
  }

  return knowledgeBase.embeddingModel;
}

export function withIndexableEmbeddingModel<T extends IndexableKnowledgeBase>(
  knowledgeBase: T,
): Omit<T, 'embeddingModel'> & { embeddingModel: KnowledgeBaseModelConfig } {
  return {
    ...knowledgeBase,
    embeddingModel: resolveIndexableEmbeddingModel(knowledgeBase),
  };
}
