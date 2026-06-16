jest.mock('@libs/shared/generated/prisma/enums', () => ({
  AiModelType: {
    EMBEDDING: 'EMBEDDING',
  },
  DocumentStatus: {
    EMBEDDING: 'EMBEDDING',
    INDEXED: 'INDEXED',
    FAILED: 'FAILED',
  },
  KnowledgeBaseStatus: {
    ACTIVE: 'ACTIVE',
    DISABLED: 'DISABLED',
  },
}));

jest.mock('@libs/shared', () => ({
  PrismaService: class PrismaService {},
}));

import { DocumentEmbeddingService } from './document-embedding.service';

describe('DocumentEmbeddingService', () => {
  it('rebuilds document embeddings and marks the document indexed', async () => {
    const embeddingModel = {
      id: 'embedding-1',
      type: 'EMBEDDING',
      isEnabled: true,
      modelName: 'text-embedding-v4',
      baseUrl: 'https://embedding.example.com/v1',
      apiKey: 'sk-embedding',
      configJson: {},
    };
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'doc-1',
          knowledgeBaseId: 'kb-1',
          knowledgeBase: {
            id: 'kb-1',
            status: 'ACTIVE',
            metadata: {},
            chunkSize: 1024,
            chunkOverlap: 128,
            embeddingModel,
          },
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const chunkIndexingService = {
      rebuildDocumentEmbeddings: jest.fn().mockResolvedValue(undefined),
      refreshIndexedDocumentStats: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DocumentEmbeddingService(
      prisma as never,
      chunkIndexingService as never,
    );

    await service.processDocument({
      documentId: 'doc-1',
      knowledgeBaseId: 'kb-1',
      requestedAt: '2026-06-16T10:00:00.000Z',
    });

    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: { status: 'EMBEDDING', errorMessage: null },
    });
    expect(chunkIndexingService.rebuildDocumentEmbeddings).toHaveBeenCalledWith(
      'doc-1',
      embeddingModel,
    );
    expect(
      chunkIndexingService.refreshIndexedDocumentStats,
    ).toHaveBeenCalledWith('doc-1');
  });

  it('marks the document failed when embedding generation fails', async () => {
    const embeddingError = new Error('embedding timeout');
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'doc-1',
          knowledgeBaseId: 'kb-1',
          knowledgeBase: {
            id: 'kb-1',
            status: 'ACTIVE',
            metadata: {},
            chunkSize: 1024,
            chunkOverlap: 128,
            embeddingModel: {
              id: 'embedding-1',
              type: 'EMBEDDING',
              isEnabled: true,
              modelName: 'text-embedding-v4',
              baseUrl: 'https://embedding.example.com/v1',
              apiKey: 'sk-embedding',
              configJson: {},
            },
          },
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const chunkIndexingService = {
      rebuildDocumentEmbeddings: jest.fn().mockRejectedValue(embeddingError),
      refreshIndexedDocumentStats: jest.fn(),
    };
    const service = new DocumentEmbeddingService(
      prisma as never,
      chunkIndexingService as never,
    );

    await expect(
      service.processDocument({
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
        requestedAt: '2026-06-16T10:00:00.000Z',
      }),
    ).rejects.toThrow(embeddingError);

    expect(prisma.document.update).toHaveBeenLastCalledWith({
      where: { id: 'doc-1' },
      data: { status: 'FAILED', errorMessage: 'embedding timeout' },
    });
    expect(
      chunkIndexingService.refreshIndexedDocumentStats,
    ).not.toHaveBeenCalled();
  });

  it('marks the document failed when the embedding model is no longer usable', async () => {
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'doc-1',
          knowledgeBaseId: 'kb-1',
          knowledgeBase: {
            id: 'kb-1',
            status: 'DISABLED',
            metadata: {},
            chunkSize: 1024,
            chunkOverlap: 128,
            embeddingModel: {
              id: 'embedding-1',
              type: 'EMBEDDING',
              isEnabled: true,
              modelName: 'text-embedding-v4',
              baseUrl: 'https://embedding.example.com/v1',
              apiKey: 'sk-embedding',
              configJson: {},
            },
          },
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const chunkIndexingService = {
      rebuildDocumentEmbeddings: jest.fn(),
      refreshIndexedDocumentStats: jest.fn(),
    };
    const service = new DocumentEmbeddingService(
      prisma as never,
      chunkIndexingService as never,
    );

    await expect(
      service.processDocument({
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
        requestedAt: '2026-06-16T10:00:00.000Z',
      }),
    ).rejects.toThrow('knowledge base is disabled');

    expect(prisma.document.update).toHaveBeenLastCalledWith({
      where: { id: 'doc-1' },
      data: {
        status: 'FAILED',
        errorMessage: 'knowledge base is disabled',
      },
    });
    expect(
      chunkIndexingService.rebuildDocumentEmbeddings,
    ).not.toHaveBeenCalled();
  });
});
