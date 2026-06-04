import { BadRequestException } from '@nestjs/common';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () => ({
  Prisma: {},
}));

jest.mock('../generated/prisma/enums', () => ({
  AiModelType: {
    EMBEDDING: 'EMBEDDING',
    RERANKER: 'RERANKER',
  },
  KnowledgeBaseStatus: {
    ACTIVE: 'ACTIVE',
    DISABLED: 'DISABLED',
  },
}));

import { RetrievalService } from './retrieval.service';

describe('RetrievalService', () => {
  const createService = (
    prisma: Record<string, unknown>,
    embeddingService: Record<string, unknown>,
    rerankService: Record<string, unknown>,
  ) =>
    new RetrievalService(
      prisma as never,
      embeddingService as never,
      rerankService as never,
    );

  it('reranks the merged vector and keyword candidates when a reranker is configured', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([
        createVectorRow({
          chunk_id: 'chunk-a',
          content: 'VPN 申请需要部门负责人审批。',
          vector_score: 0.8,
        }),
        createVectorRow({
          chunk_id: 'chunk-b',
          content: '密码重置需要短信验证码。',
          vector_score: 0.7,
        }),
      ])
      .mockResolvedValueOnce([
        createKeywordRow({
          chunk_id: 'chunk-c',
          content: '员工入职会自动创建 IT 账号。',
          keyword_score: 0.6,
        }),
      ]);
    const rerankDocuments = jest.fn().mockResolvedValue([
      { index: 2, score: 0.95 },
      { index: 0, score: 0.73 },
    ]);
    const service = createService(
      {
        knowledgeBase: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'kb-1',
            status: 'ACTIVE',
            embeddingModel: createModel({
              id: 'embedding-1',
              type: 'EMBEDDING',
            }),
            rerankerModel: createModel({
              id: 'reranker-1',
              type: 'RERANKER',
              modelName: 'qwen3-rerank',
            }),
          }),
        },
        $queryRaw: queryRaw,
      },
      {
        embedTexts: jest.fn().mockResolvedValue([[0.1, 0.2]]),
      },
      {
        rerankDocuments,
      },
    );

    const result = await service.retrieveFromKnowledgeBase(
      'kb-1',
      'IT 账号如何开通？',
      2,
    );

    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(rerankDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reranker-1' }),
      {
        query: 'IT 账号如何开通？',
        documents: [
          'VPN 申请需要部门负责人审批。',
          '密码重置需要短信验证码。',
          '员工入职会自动创建 IT 账号。',
        ],
        topN: 2,
      },
    );
    expect(result.hits.map((hit) => hit.chunkId)).toEqual([
      'chunk-c',
      'chunk-a',
    ]);
    expect(result.hits[0]).toEqual(
      expect.objectContaining({
        score: 0.95,
        finalScore: 0.95,
        rerankScore: 0.95,
      }),
    );
  });

  it('deduplicates hybrid vector and keyword candidates before reranking', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([
        createVectorRow({
          chunk_id: 'chunk-a',
          content: 'VPN 申请需要部门负责人审批。',
          vector_score: 0.8,
        }),
        createVectorRow({
          chunk_id: 'chunk-b',
          content: '密码重置需要短信验证码。',
          vector_score: 0.7,
        }),
      ])
      .mockResolvedValueOnce([
        createKeywordRow({
          chunk_id: 'chunk-a',
          content: 'VPN 申请需要部门负责人审批。',
          keyword_score: 0.5,
        }),
        createKeywordRow({
          chunk_id: 'chunk-c',
          content: '员工入职会自动创建 IT 账号。',
          keyword_score: 0.9,
        }),
      ]);
    const rerankDocuments = jest.fn().mockResolvedValue([
      { index: 0, score: 0.96 },
      { index: 1, score: 0.73 },
      { index: 2, score: 0.61 },
    ]);
    const service = createService(
      {
        knowledgeBase: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'kb-1',
            status: 'ACTIVE',
            embeddingModel: createModel({
              id: 'embedding-1',
              type: 'EMBEDDING',
            }),
            rerankerModel: createModel({
              id: 'reranker-1',
              type: 'RERANKER',
              modelName: 'qwen3-rerank',
            }),
          }),
        },
        $queryRaw: queryRaw,
      },
      {
        embedTexts: jest.fn().mockResolvedValue([[0.1, 0.2]]),
      },
      {
        rerankDocuments,
      },
    );

    const result = await service.retrieveFromKnowledgeBase('kb-1', 'VPN', 3);

    expect(rerankDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reranker-1' }),
      {
        query: 'VPN',
        documents: [
          'VPN 申请需要部门负责人审批。',
          '密码重置需要短信验证码。',
          '员工入职会自动创建 IT 账号。',
        ],
        topN: 3,
      },
    );
    expect(result.hits).toHaveLength(3);
    expect(result.hits[0]).toEqual(
      expect.objectContaining({
        chunkId: 'chunk-a',
        matchReason: 'HYBRID',
        vectorScore: 0.8,
        keywordScore: 0.5,
        finalScore: 0.96,
        rerankScore: 0.96,
      }),
    );
  });

  it('keeps hybrid ranking unchanged when no reranker is configured', async () => {
    const rerankDocuments = jest.fn();
    const service = createService(
      {
        knowledgeBase: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'kb-1',
            status: 'ACTIVE',
            embeddingModel: createModel({
              id: 'embedding-1',
              type: 'EMBEDDING',
            }),
            rerankerModel: null,
          }),
        },
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([
            createVectorRow({
              chunk_id: 'chunk-a',
              vector_score: 0.8,
            }),
          ])
          .mockResolvedValueOnce([
            createKeywordRow({
              chunk_id: 'chunk-b',
              keyword_score: 0.9,
            }),
          ]),
      },
      {
        embedTexts: jest.fn().mockResolvedValue([[0.1, 0.2]]),
      },
      {
        rerankDocuments,
      },
    );

    const result = await service.retrieveFromKnowledgeBase('kb-1', 'VPN', 2);

    expect(rerankDocuments).not.toHaveBeenCalled();
    expect(result.hits.map((hit) => hit.rerankScore)).toEqual([null, null]);
    expect(result.hits.map((hit) => hit.chunkId)).toEqual([
      'chunk-a',
      'chunk-b',
    ]);
  });

  it('returns the imported document relative path when metadata provides it', async () => {
    const rerankDocuments = jest.fn();
    const service = createService(
      {
        knowledgeBase: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'kb-1',
            status: 'ACTIVE',
            embeddingModel: createModel({
              id: 'embedding-1',
              type: 'EMBEDDING',
            }),
            rerankerModel: null,
          }),
        },
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([
            createVectorRow({
              chunk_id: 'chunk-a',
              document_path: 'content/handbook/about/contributing.md',
              vector_score: 0.8,
            }),
          ])
          .mockResolvedValueOnce([]),
      },
      {
        embedTexts: jest.fn().mockResolvedValue([[0.1, 0.2]]),
      },
      {
        rerankDocuments,
      },
    );

    const result = await service.retrieveFromKnowledgeBase(
      'kb-1',
      'handbook',
      1,
    );

    expect(result.hits[0]).toEqual(
      expect.objectContaining({
        documentName: 'IT 文档',
        documentPath: 'content/handbook/about/contributing.md',
      }),
    );
  });

  it('rejects disabled reranker models', async () => {
    const service = createService(
      {
        knowledgeBase: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'kb-1',
            status: 'ACTIVE',
            embeddingModel: createModel({
              id: 'embedding-1',
              type: 'EMBEDDING',
            }),
            rerankerModel: createModel({
              id: 'reranker-1',
              type: 'RERANKER',
              isEnabled: false,
            }),
          }),
        },
      },
      {},
      {},
    );

    await expect(
      service.retrieveFromKnowledgeBase('kb-1', 'VPN', 2),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function createModel(input: {
  id: string;
  type: string;
  modelName?: string;
  isEnabled?: boolean;
}) {
  return {
    id: input.id,
    type: input.type,
    isEnabled: input.isEnabled ?? true,
    modelName: input.modelName ?? 'model-name',
    baseUrl: 'https://example.com/v1',
    apiKey: 'sk-test',
    configJson: {},
  };
}

function createVectorRow(input: {
  chunk_id: string;
  content?: string;
  document_path?: string | null;
  vector_score: number;
}) {
  return {
    chunk_id: input.chunk_id,
    document_id: 'doc-1',
    document_name: 'IT 文档',
    document_path: input.document_path ?? null,
    title: null,
    content: input.content ?? '测试分段',
    position: 0,
    char_count: 4,
    vector_score: input.vector_score,
  };
}

function createKeywordRow(input: {
  chunk_id: string;
  content?: string;
  document_path?: string | null;
  keyword_score: number;
}) {
  return {
    chunk_id: input.chunk_id,
    document_id: 'doc-1',
    document_name: 'IT 文档',
    document_path: input.document_path ?? null,
    title: null,
    content: input.content ?? '测试分段',
    position: 0,
    char_count: 4,
    keyword_score: input.keyword_score,
  };
}
