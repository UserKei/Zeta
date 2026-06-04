import { BadRequestException } from '@nestjs/common';
import {
  AiModelType,
  KnowledgeBaseStatus,
} from '@libs/shared/generated/prisma/enums';
import {
  resolveIndexableEmbeddingModel,
  withIndexableEmbeddingModel,
  type IndexableKnowledgeBase,
} from './knowledge-base-model-resolver';

describe('knowledge base model resolver', () => {
  const embeddingModel = {
    id: 'embedding-1',
    type: AiModelType.EMBEDDING,
    isEnabled: true,
    modelName: 'text-embedding-v4',
    baseUrl: 'https://embedding.example.com/v1',
    apiKey: 'sk-embedding',
    configJson: {},
  };
  const knowledgeBase = {
    id: 'kb-1',
    status: KnowledgeBaseStatus.ACTIVE,
    metadata: {},
    chunkSize: 1024,
    chunkOverlap: 128,
    embeddingModel,
    visionModel: null,
  } satisfies IndexableKnowledgeBase;

  it('returns the enabled embedding model for an active knowledge base', () => {
    expect(resolveIndexableEmbeddingModel(knowledgeBase)).toBe(embeddingModel);
  });

  it('returns a knowledge base with a non-null embedding model', () => {
    expect(withIndexableEmbeddingModel(knowledgeBase)).toEqual({
      ...knowledgeBase,
      embeddingModel,
    });
  });

  it('rejects disabled knowledge bases', () => {
    expect(() =>
      resolveIndexableEmbeddingModel({
        ...knowledgeBase,
        status: KnowledgeBaseStatus.DISABLED,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects missing, disabled, or non-embedding models', () => {
    expect(() =>
      resolveIndexableEmbeddingModel({
        ...knowledgeBase,
        embeddingModel: null,
      }),
    ).toThrow('knowledge base embedding model is not configured');

    expect(() =>
      resolveIndexableEmbeddingModel({
        ...knowledgeBase,
        embeddingModel: { ...embeddingModel, isEnabled: false },
      }),
    ).toThrow('knowledge base embedding model must be enabled');

    expect(() =>
      resolveIndexableEmbeddingModel({
        ...knowledgeBase,
        embeddingModel: { ...embeddingModel, type: AiModelType.IMAGE },
      }),
    ).toThrow('knowledge base embedding model must be enabled');
  });
});
