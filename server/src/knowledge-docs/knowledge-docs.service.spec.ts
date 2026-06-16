jest.mock('@libs/shared', () => ({
  FileParserService: class FileParserService {},
  FileStorageService: class FileStorageService {},
  PrismaService: class PrismaService {},
}));

jest.mock('../retrieval/retrieval.service', () => ({
  RetrievalService: class RetrievalService {},
}));

jest.mock('@libs/model-adapters', () => ({
  EmbeddingService: class EmbeddingService {},
  ImageUnderstandingService: class ImageUnderstandingService {},
}));

jest.mock('@libs/shared/generated/prisma/client', () => ({
  Prisma: {},
}));

jest.mock('@libs/shared/generated/prisma/enums', () => ({
  AiModelType: {
    EMBEDDING: 'EMBEDDING',
    IMAGE: 'IMAGE',
  },
  ChunkStatus: {
    ACTIVE: 'ACTIVE',
    DISABLED: 'DISABLED',
  },
  DocumentSourceType: {
    FILE_UPLOAD: 'FILE_UPLOAD',
    MANUAL: 'MANUAL',
    AI_EXTRACTED: 'AI_EXTRACTED',
  },
  DocumentStatus: {
    DRAFT: 'DRAFT',
    CHUNKING: 'CHUNKING',
    EMBEDDING: 'EMBEDDING',
    INDEXED: 'INDEXED',
    FAILED: 'FAILED',
  },
  KnowledgeBaseStatus: {
    ACTIVE: 'ACTIVE',
    DISABLED: 'DISABLED',
  },
}));

import { KnowledgeDocsService } from './knowledge-docs.service';

describe('KnowledgeDocsService manual documents', () => {
  const embeddingModel = {
    id: 'embedding-1',
    type: 'EMBEDDING',
    isEnabled: true,
    modelName: 'text-embedding-v4',
    baseUrl: 'https://embedding.example.com/v1',
    apiKey: 'sk-embedding',
    configJson: {},
  };

  const indexableKnowledgeBase = {
    id: 'kb-1',
    status: 'ACTIVE',
    metadata: {},
    chunkSize: 800,
    chunkOverlap: 80,
    embeddingModel,
    visionModel: null,
  };

  const activeChunk = {
    id: 'chunk-1',
    knowledgeBaseId: 'kb-1',
    documentId: 'doc-1',
    title: '规则',
    content: '采购审批规则',
    position: 0,
    tokenCount: null,
    charCount: 6,
    status: 'ACTIVE',
    metadata: {},
    createdAt: new Date('2026-05-31T00:00:00.000Z'),
    updatedAt: new Date('2026-05-31T00:00:00.000Z'),
  };

  it('creates a blank manual document without chunks or embeddings', async () => {
    type BlankDocumentCreateArgs = {
      data: {
        status: string;
        charCount: number;
        chunkCount: number;
      };
    };
    const documentCreate = jest
      .fn<Promise<unknown>, [BlankDocumentCreateArgs]>()
      .mockResolvedValue({
        id: 'doc-blank',
        knowledgeBaseId: 'kb-1',
        sourceFileId: null,
        name: '空白文档',
        sourceType: 'MANUAL',
        status: 'DRAFT',
        charCount: 0,
        chunkCount: 0,
        errorMessage: null,
        metadata: { description: null },
        createdAt: new Date('2026-05-31T00:00:00.000Z'),
        updatedAt: new Date('2026-05-31T00:00:00.000Z'),
      });
    const documentUpdate = jest.fn();
    const prisma = {
      knowledgeBase: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'kb-1',
          status: 'ACTIVE',
          embeddingModel: {
            id: 'embedding-1',
            type: 'EMBEDDING',
            isEnabled: true,
            modelName: 'text-embedding-v4',
            baseUrl: 'https://embedding.example.com/v1',
            apiKey: 'sk-embedding',
            configJson: {},
          },
        }),
      },
      document: {
        create: documentCreate,
        update: documentUpdate,
      },
      chunk: {
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
      chunkEmbedding: {
        deleteMany: jest.fn(),
      },
      $executeRaw: jest.fn(),
    };
    const chunkIndexingService = {
      createChunks: jest.fn(),
      refreshDocumentSearchVector: jest.fn(),
      rebuildDocumentEmbeddings: jest.fn(),
    };
    const service = new KnowledgeDocsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      chunkIndexingService as never,
    );

    const document = await service.createManual('kb-1', {
      name: '空白文档',
      chunks: [],
    });

    expect(document).toEqual(
      expect.objectContaining({
        id: 'doc-blank',
        name: '空白文档',
        status: 'DRAFT',
        chunkCount: 0,
        charCount: 0,
      }),
    );
    expect(documentCreate.mock.calls[0]?.[0]).toMatchObject({
      data: {
        status: 'DRAFT',
        charCount: 0,
        chunkCount: 0,
      },
    });
    expect(prisma.chunk.createMany).not.toHaveBeenCalled();
    expect(chunkIndexingService.createChunks).not.toHaveBeenCalled();
    expect(
      chunkIndexingService.rebuildDocumentEmbeddings,
    ).not.toHaveBeenCalled();
    expect(documentUpdate).not.toHaveBeenCalled();
  });

  it('queues document embedding after creating a chunk', async () => {
    const transactionDb = {
      chunk: {
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue(activeChunk),
      },
    };
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'doc-1',
          knowledgeBaseId: 'kb-1',
          chunkCount: 1,
          knowledgeBase: indexableKnowledgeBase,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'doc-1',
          knowledgeBaseId: 'kb-1',
          sourceFileId: null,
          name: '规则文档',
          sourceType: 'MANUAL',
          status: 'EMBEDDING',
          charCount: 6,
          chunkCount: 1,
          errorMessage: null,
          metadata: {},
          createdAt: new Date('2026-05-31T00:00:00.000Z'),
          updatedAt: new Date('2026-05-31T00:00:00.000Z'),
        }),
      },
      chunk: {
        count: jest.fn().mockResolvedValue(1),
        findUniqueOrThrow: jest.fn().mockResolvedValue(activeChunk),
      },
      $transaction: jest.fn((callback: (db: typeof transactionDb) => unknown) =>
        Promise.resolve(callback(transactionDb)),
      ),
    };
    const chunkIndexingService = {
      refreshChunkSearchVector: jest.fn().mockResolvedValue(undefined),
      refreshDocumentStats: jest.fn().mockResolvedValue(undefined),
      syncChunkEmbedding: jest.fn(),
    };
    const documentProcessingJobService = {
      enqueueDocumentEmbedding: jest.fn().mockResolvedValue(undefined),
    };
    const service = new KnowledgeDocsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      chunkIndexingService as never,
      documentProcessingJobService as never,
    );

    await service.createChunk('doc-1', {
      title: '规则',
      content: '采购审批规则',
      status: 'ACTIVE',
    });

    expect(chunkIndexingService.refreshChunkSearchVector).toHaveBeenCalledWith(
      'chunk-1',
    );
    expect(chunkIndexingService.refreshDocumentStats).toHaveBeenCalledWith(
      'doc-1',
    );
    expect(chunkIndexingService.syncChunkEmbedding).not.toHaveBeenCalled();
    expect(prisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1' },
        data: { status: 'EMBEDDING', errorMessage: null },
      }),
    );
    expect(
      documentProcessingJobService.enqueueDocumentEmbedding,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
        requestedAt: '2026-05-31T00:00:00.000Z',
      }),
    );
  });

  it('clears stale chunk embeddings and queues document embedding after updating a chunk', async () => {
    const updatedChunk = {
      ...activeChunk,
      content: '采购审批需要部门负责人确认',
      charCount: 14,
    };
    const prisma = {
      document: {
        update: jest.fn().mockResolvedValue({
          id: 'doc-1',
          knowledgeBaseId: 'kb-1',
          sourceFileId: null,
          name: '规则文档',
          sourceType: 'MANUAL',
          status: 'EMBEDDING',
          charCount: 14,
          chunkCount: 1,
          errorMessage: null,
          metadata: {},
          createdAt: new Date('2026-05-31T00:00:00.000Z'),
          updatedAt: new Date('2026-05-31T00:00:00.000Z'),
        }),
      },
      chunk: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'chunk-1',
          documentId: 'doc-1',
          title: '规则',
          content: '采购审批规则',
          status: 'ACTIVE',
          document: { knowledgeBase: indexableKnowledgeBase },
        }),
        update: jest.fn().mockResolvedValue(updatedChunk),
      },
    };
    const chunkIndexingService = {
      refreshChunkSearchVector: jest.fn().mockResolvedValue(undefined),
      deleteChunkEmbeddings: jest.fn().mockResolvedValue(undefined),
      refreshDocumentStats: jest.fn().mockResolvedValue(undefined),
      syncChunkEmbedding: jest.fn(),
    };
    const documentProcessingJobService = {
      enqueueDocumentEmbedding: jest.fn().mockResolvedValue(undefined),
    };
    const service = new KnowledgeDocsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      chunkIndexingService as never,
      documentProcessingJobService as never,
    );

    await service.updateChunk('chunk-1', {
      content: '采购审批需要部门负责人确认',
    });

    expect(chunkIndexingService.refreshChunkSearchVector).toHaveBeenCalledWith(
      'chunk-1',
    );
    expect(chunkIndexingService.deleteChunkEmbeddings).toHaveBeenCalledWith(
      'chunk-1',
    );
    expect(chunkIndexingService.refreshDocumentStats).toHaveBeenCalledWith(
      'doc-1',
    );
    expect(chunkIndexingService.syncChunkEmbedding).not.toHaveBeenCalled();
    expect(
      documentProcessingJobService.enqueueDocumentEmbedding,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
        requestedAt: '2026-05-31T00:00:00.000Z',
      }),
    );
  });

  it('queues document embedding when reindexing a document', async () => {
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'doc-1',
          knowledgeBaseId: 'kb-1',
          knowledgeBase: indexableKnowledgeBase,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'doc-1',
          knowledgeBaseId: 'kb-1',
          sourceFileId: null,
          name: '规则文档',
          sourceType: 'MANUAL',
          status: 'EMBEDDING',
          charCount: 6,
          chunkCount: 1,
          errorMessage: null,
          metadata: {},
          createdAt: new Date('2026-05-31T00:00:00.000Z'),
          updatedAt: new Date('2026-05-31T00:00:00.000Z'),
        }),
      },
    };
    const documentProcessingJobService = {
      enqueueDocumentEmbedding: jest.fn().mockResolvedValue(undefined),
    };
    const service = new KnowledgeDocsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      documentProcessingJobService as never,
    );

    const document = await service.reindexDocument('doc-1');

    expect(prisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1' },
        data: { status: 'EMBEDDING', errorMessage: null },
      }),
    );
    expect(
      documentProcessingJobService.enqueueDocumentEmbedding,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
        requestedAt: '2026-05-31T00:00:00.000Z',
      }),
    );
    expect(document).toEqual(
      expect.objectContaining({ id: 'doc-1', status: 'EMBEDDING' }),
    );
  });

  it('rejects reindexing a document without chunks', async () => {
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'doc-1',
          knowledgeBaseId: 'kb-1',
          chunkCount: 0,
          knowledgeBase: indexableKnowledgeBase,
        }),
        update: jest.fn(),
      },
    };
    const documentProcessingJobService = {
      enqueueDocumentEmbedding: jest.fn(),
    };
    const service = new KnowledgeDocsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      documentProcessingJobService as never,
    );

    await expect(service.reindexDocument('doc-1')).rejects.toThrow(
      'document must have chunks',
    );
    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(
      documentProcessingJobService.enqueueDocumentEmbedding,
    ).not.toHaveBeenCalled();
  });

  it('removes document database records in one transaction before file cleanup', async () => {
    const document = {
      id: 'doc-1',
      sourceFileId: 'source-file-1',
      metadata: {
        assets: [{ fileId: 'asset-file-1' }],
      },
    };
    const transactionDb = {
      chatCitation: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      chunkEmbedding: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      chunk: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'chunk-1' }, { id: 'chunk-2' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      document: {
        delete: jest.fn().mockResolvedValue(document),
      },
    };
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue(document),
      },
      $transaction: jest.fn((callback: (db: typeof transactionDb) => unknown) =>
        Promise.resolve(callback(transactionDb)),
      ),
    };
    const fileStorageService = {
      removeFilesIfUnreferenced: jest.fn().mockResolvedValue(undefined),
    };
    const documentAssetService = {
      getDocumentAssetFileIds: jest.fn().mockReturnValue(['asset-file-1']),
    };
    const service = new KnowledgeDocsService(
      prisma as never,
      fileStorageService as never,
      {} as never,
      {} as never,
      documentAssetService as never,
      {} as never,
    );

    await expect(service.remove('doc-1')).resolves.toEqual({ id: 'doc-1' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionDb.chunk.findMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1' },
      select: { id: true },
    });
    expect(transactionDb.chatCitation.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { documentId: 'doc-1' },
          { chunkId: { in: ['chunk-1', 'chunk-2'] } },
        ],
      },
    });
    expect(transactionDb.chunkEmbedding.deleteMany).toHaveBeenCalledWith({
      where: { chunkId: { in: ['chunk-1', 'chunk-2'] } },
    });
    expect(transactionDb.chunk.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['chunk-1', 'chunk-2'] } },
    });
    expect(transactionDb.document.delete).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
    });
    expect(fileStorageService.removeFilesIfUnreferenced).toHaveBeenCalledWith([
      'source-file-1',
      'asset-file-1',
    ]);
  });
});
