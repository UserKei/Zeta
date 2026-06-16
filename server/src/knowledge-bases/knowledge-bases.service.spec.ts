import { NotFoundException } from '@nestjs/common';

jest.mock('@libs/shared', () => ({
  FileStorageService: class FileStorageService {},
  PrismaService: class PrismaService {},
}));

jest.mock('@libs/shared/generated/prisma/client', () => ({
  Prisma: {},
}));

jest.mock('@libs/shared/generated/prisma/enums', () => ({
  AiModelType: {
    EMBEDDING: 'EMBEDDING',
    IMAGE: 'IMAGE',
    RERANKER: 'RERANKER',
  },
  ChunkStatus: {
    ACTIVE: 'ACTIVE',
    DISABLED: 'DISABLED',
  },
  DocumentStatus: {
    EMBEDDING: 'EMBEDDING',
    FAILED: 'FAILED',
  },
  KnowledgeBaseStatus: {
    ACTIVE: 'ACTIVE',
    DISABLED: 'DISABLED',
  },
}));

import { KnowledgeBasesService } from './knowledge-bases.service';

describe('KnowledgeBasesService getUsage', () => {
  const createService = (prisma: Record<string, unknown>) =>
    new KnowledgeBasesService(prisma as never, {} as never);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns empty usage summary when there are no chat citations', async () => {
    const service = createService({
      knowledgeBase: {
        findUnique: jest.fn().mockResolvedValue({ id: 'kb-1' }),
      },
      chatCitation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      chunk: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    const result = await service.getUsage('kb-1', 'all');

    expect(result).toEqual({
      range: 'all',
      totalCitations: 0,
      totalChunkCount: 0,
      citedDocumentCount: 0,
      citedChunkCount: 0,
      chunkCoverageRate: 0,
      lastCitedAt: null,
      topDocuments: [],
      topChunks: [],
    });
  });

  it('aggregates document and chunk usage from chat citations', async () => {
    type ChatCitationFindManyInput = {
      where?: {
        createdAt?: { gte: Date };
      };
    };
    const chatCitationFindMany = jest
      .fn<Promise<unknown[]>, [ChatCitationFindManyInput]>()
      .mockResolvedValue([
        {
          id: 'citation-1',
          createdAt: new Date('2026-05-30T08:00:00.000Z'),
          document: {
            id: 'doc-1',
            name: 'IT 账号流程',
            sourceType: 'FILE_UPLOAD',
          },
          chunk: {
            id: 'chunk-1',
            documentId: 'doc-1',
            title: 'VPN 权限',
            position: 1,
            content: 'VPN 权限提交审批后通常 1 个工作日内生效。',
          },
        },
        {
          id: 'citation-2',
          createdAt: new Date('2026-05-31T09:00:00.000Z'),
          document: {
            id: 'doc-1',
            name: 'IT 账号流程',
            sourceType: 'FILE_UPLOAD',
          },
          chunk: {
            id: 'chunk-1',
            documentId: 'doc-1',
            title: 'VPN 权限',
            position: 1,
            content: 'VPN 权限提交审批后通常 1 个工作日内生效。',
          },
        },
        {
          id: 'citation-3',
          createdAt: new Date('2026-05-29T10:00:00.000Z'),
          document: {
            id: 'doc-2',
            name: '采购制度',
            sourceType: 'MANUAL',
          },
          chunk: {
            id: 'chunk-2',
            documentId: 'doc-2',
            title: null,
            position: 0,
            content: '采购合同超过 100 万需要部门负责人和财务共同审批。',
          },
        },
      ]);
    const service = createService({
      knowledgeBase: {
        findUnique: jest.fn().mockResolvedValue({ id: 'kb-1' }),
      },
      chatCitation: {
        findMany: chatCitationFindMany,
      },
      chunk: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'chunk-1', documentId: 'doc-1' },
          { id: 'chunk-2', documentId: 'doc-2' },
          { id: 'chunk-3', documentId: 'doc-1' },
          { id: 'chunk-4', documentId: 'doc-1' },
        ]),
      },
    });

    const result = await service.getUsage('kb-1', '7d');

    expect(chatCitationFindMany.mock.calls[0]?.[0].where?.createdAt).toEqual({
      gte: new Date('2026-05-24T12:00:00.000Z'),
    });
    expect(result.totalCitations).toBe(3);
    expect(result.totalChunkCount).toBe(4);
    expect(result.citedDocumentCount).toBe(2);
    expect(result.citedChunkCount).toBe(2);
    expect(result.chunkCoverageRate).toBe(0.5);
    expect(result.lastCitedAt).toBe('2026-05-31T09:00:00.000Z');
    expect(result.topDocuments).toEqual([
      expect.objectContaining({
        documentId: 'doc-1',
        documentName: 'IT 账号流程',
        sourceType: 'FILE_UPLOAD',
        citationCount: 2,
        citedChunkCount: 1,
        chunkCount: 3,
        chunkCoverageRate: 1 / 3,
        lastCitedAt: '2026-05-31T09:00:00.000Z',
      }),
      expect.objectContaining({
        documentId: 'doc-2',
        documentName: '采购制度',
        citationCount: 1,
        citedChunkCount: 1,
        chunkCount: 1,
        chunkCoverageRate: 1,
      }),
    ]);
    expect(result.topChunks[0]).toEqual(
      expect.objectContaining({
        chunkId: 'chunk-1',
        documentId: 'doc-1',
        documentName: 'IT 账号流程',
        chunkPosition: 1,
        title: 'VPN 权限',
        citationCount: 2,
        preview: 'VPN 权限提交审批后通常 1 个工作日内生效。',
      }),
    );
  });

  it('rejects missing knowledge bases before aggregating usage', async () => {
    const chatCitationFindMany = jest.fn();
    const service = createService({
      knowledgeBase: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      chatCitation: {
        findMany: chatCitationFindMany,
      },
    });

    await expect(service.getUsage('missing-kb', 'all')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(chatCitationFindMany).not.toHaveBeenCalled();
  });
});

describe('KnowledgeBasesService vision settings', () => {
  const createService = (prisma: Record<string, unknown>) =>
    new KnowledgeBasesService(prisma as never, {} as never);

  it('stores a vision model and image understanding prompt in knowledge base settings', async () => {
    const knowledgeBaseUpdate = jest.fn().mockResolvedValue({
      id: 'kb-1',
      name: 'IT 知识库',
      metadata: {
        imageUnderstandingPrompt: '提取图片中的业务信息。',
      },
    });
    const aiModelFindFirst = jest.fn().mockResolvedValue({ id: 'vision-1' });
    const service = createService({
      knowledgeBase: {
        findUnique: jest.fn().mockResolvedValue({ id: 'kb-1' }),
        update: knowledgeBaseUpdate,
      },
      aiModel: {
        findFirst: aiModelFindFirst,
      },
    });

    await service.update('kb-1', {
      visionModelId: 'vision-1',
      imageUnderstandingPrompt: '提取图片中的业务信息。',
    });

    expect(aiModelFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'vision-1',
        type: 'IMAGE',
        isEnabled: true,
      },
      select: { id: true },
    });
    expect(knowledgeBaseUpdate).toHaveBeenCalledWith({
      where: { id: 'kb-1' },
      data: {
        visionModel: { connect: { id: 'vision-1' } },
        metadata: {
          imageUnderstandingPrompt: '提取图片中的业务信息。',
        },
      },
      select: expect.any(Object) as unknown,
    });
  });

  it('can clear the configured vision model', async () => {
    const knowledgeBaseUpdate = jest.fn().mockResolvedValue({
      id: 'kb-1',
      visionModelId: null,
    });
    const aiModelFindFirst = jest.fn();
    const service = createService({
      knowledgeBase: {
        findUnique: jest.fn().mockResolvedValue({ id: 'kb-1' }),
        update: knowledgeBaseUpdate,
      },
      aiModel: {
        findFirst: aiModelFindFirst,
      },
    });

    await service.update('kb-1', { visionModelId: null });

    expect(aiModelFindFirst).not.toHaveBeenCalled();
    expect(knowledgeBaseUpdate).toHaveBeenCalledWith({
      where: { id: 'kb-1' },
      data: {
        visionModel: { disconnect: true },
      },
      select: expect.any(Object) as unknown,
    });
  });
});

describe('KnowledgeBasesService reranker settings', () => {
  const createService = (prisma: Record<string, unknown>) =>
    new KnowledgeBasesService(prisma as never, {} as never);

  it('stores a reranker model in knowledge base settings', async () => {
    const knowledgeBaseUpdate = jest.fn().mockResolvedValue({
      id: 'kb-1',
      rerankerModelId: 'reranker-1',
    });
    const aiModelFindFirst = jest.fn().mockResolvedValue({ id: 'reranker-1' });
    const service = createService({
      knowledgeBase: {
        findUnique: jest.fn().mockResolvedValue({ id: 'kb-1' }),
        update: knowledgeBaseUpdate,
      },
      aiModel: {
        findFirst: aiModelFindFirst,
      },
    });

    await service.update('kb-1', {
      rerankerModelId: 'reranker-1',
    });

    expect(aiModelFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'reranker-1',
        type: 'RERANKER',
        isEnabled: true,
      },
      select: { id: true },
    });
    expect(knowledgeBaseUpdate).toHaveBeenCalledWith({
      where: { id: 'kb-1' },
      data: {
        rerankerModel: { connect: { id: 'reranker-1' } },
      },
      select: expect.any(Object) as unknown,
    });
  });

  it('can clear the configured reranker model', async () => {
    const knowledgeBaseUpdate = jest.fn().mockResolvedValue({
      id: 'kb-1',
      rerankerModelId: null,
    });
    const aiModelFindFirst = jest.fn();
    const service = createService({
      knowledgeBase: {
        findUnique: jest.fn().mockResolvedValue({ id: 'kb-1' }),
        update: knowledgeBaseUpdate,
      },
      aiModel: {
        findFirst: aiModelFindFirst,
      },
    });

    await service.update('kb-1', { rerankerModelId: null });

    expect(aiModelFindFirst).not.toHaveBeenCalled();
    expect(knowledgeBaseUpdate).toHaveBeenCalledWith({
      where: { id: 'kb-1' },
      data: {
        rerankerModel: { disconnect: true },
      },
      select: expect.any(Object) as unknown,
    });
  });
});

describe('KnowledgeBasesService embedding model updates', () => {
  const createService = (
    prisma: Record<string, unknown>,
    documentProcessingJobService?: Record<string, unknown>,
  ) =>
    new KnowledgeBasesService(
      prisma as never,
      {} as never,
      documentProcessingJobService as never,
    );

  it('queues existing documents for embedding when the embedding model changes', async () => {
    const knowledgeBaseUpdate = jest.fn().mockResolvedValue({
      id: 'kb-1',
      embeddingModelId: 'embedding-new',
    });
    const documentUpdate = jest.fn().mockResolvedValue({
      updatedAt: new Date('2026-05-31T00:00:00.000Z'),
    });
    const enqueueDocumentEmbedding = jest.fn().mockResolvedValue(undefined);
    const service = createService(
      {
        knowledgeBase: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'kb-1',
            metadata: {},
            embeddingModelId: 'embedding-old',
          }),
          update: knowledgeBaseUpdate,
        },
        aiModel: {
          findFirst: jest.fn().mockResolvedValue({ id: 'embedding-new' }),
        },
        document: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'doc-1' }, { id: 'doc-2' }]),
          update: documentUpdate,
        },
      },
      { enqueueDocumentEmbedding },
    );

    await service.update('kb-1', { embeddingModelId: 'embedding-new' });

    expect(documentUpdate).toHaveBeenCalledTimes(2);
    expect(documentUpdate).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: { status: 'EMBEDDING', errorMessage: null },
      select: { updatedAt: true },
    });
    expect(enqueueDocumentEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
      }),
    );
    expect(enqueueDocumentEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-2',
        knowledgeBaseId: 'kb-1',
      }),
    );
  });

  it('does not queue documents when the embedding model id is unchanged', async () => {
    const enqueueDocumentEmbedding = jest.fn();
    const documentFindMany = jest.fn();
    const service = createService(
      {
        knowledgeBase: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'kb-1',
            metadata: {},
            embeddingModelId: 'embedding-1',
          }),
          update: jest.fn().mockResolvedValue({
            id: 'kb-1',
            embeddingModelId: 'embedding-1',
          }),
        },
        aiModel: {
          findFirst: jest.fn().mockResolvedValue({ id: 'embedding-1' }),
        },
        document: {
          findMany: documentFindMany,
          update: jest.fn(),
        },
      },
      { enqueueDocumentEmbedding },
    );

    await service.update('kb-1', { embeddingModelId: 'embedding-1' });

    expect(documentFindMany).not.toHaveBeenCalled();
    expect(enqueueDocumentEmbedding).not.toHaveBeenCalled();
  });

  it('queues existing documents when rebuilding a knowledge base index', async () => {
    const documentUpdate = jest.fn().mockResolvedValue({
      updatedAt: new Date('2026-05-31T00:00:00.000Z'),
    });
    const enqueueDocumentEmbedding = jest.fn().mockResolvedValue(undefined);
    const service = createService(
      {
        knowledgeBase: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'kb-1',
            metadata: {},
            embeddingModelId: 'embedding-1',
          }),
        },
        document: {
          findMany: jest.fn().mockResolvedValue([{ id: 'doc-1' }]),
          update: documentUpdate,
        },
      },
      { enqueueDocumentEmbedding },
    );

    await expect(service.reindex('kb-1')).resolves.toEqual({ id: 'kb-1' });
    expect(documentUpdate).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: { status: 'EMBEDDING', errorMessage: null },
      select: { updatedAt: true },
    });
    expect(enqueueDocumentEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
      }),
    );
  });
});
