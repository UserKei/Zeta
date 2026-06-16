jest.mock('@libs/shared/generated/prisma/enums', () => ({
  AiModelType: {
    EMBEDDING: 'EMBEDDING',
    IMAGE: 'IMAGE',
  },
  ChunkStatus: {
    ACTIVE: 'ACTIVE',
    DISABLED: 'DISABLED',
  },
  DocumentStatus: {
    CHUNKING: 'CHUNKING',
    EMBEDDING: 'EMBEDDING',
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

import { DocumentImageUnderstandingService } from './document-image-understanding.service';

type DocumentUpdateArgs = {
  where: { id: string };
  data: Record<string, unknown>;
  select?: Record<string, unknown>;
};

describe('DocumentImageUnderstandingService', () => {
  const embeddingModel = {
    id: 'embedding-1',
    type: 'EMBEDDING',
    isEnabled: true,
    modelName: 'text-embedding-v4',
    baseUrl: 'https://embedding.example.com/v1',
    apiKey: 'sk-embedding',
    configJson: {},
  };
  const visionModel = {
    id: 'vision-1',
    type: 'IMAGE',
    isEnabled: true,
    modelName: 'qwen-vl-max',
    baseUrl: 'https://vision.example.com/v1',
    apiKey: 'sk-vision',
    configJson: {},
  };
  const asset = {
    fileId: 'asset-file-1',
    fileName: 'image1.png',
    mimeType: 'image/png',
    fileSize: 64,
    source: 'DOCX_IMAGE',
    sha256Hash: 'asset-hash',
    originalReference: './files/image1.png',
    reference: './files/asset-file-1',
  };
  const sourceChunk = {
    id: 'chunk-1',
    title: '图文材料',
    content: '![流程图](./files/asset-file-1)',
    status: 'ACTIVE',
    position: 0,
    charCount: 28,
    metadata: {
      assetFileId: 'asset-file-1',
      assetSource: 'DOCX_IMAGE',
    },
  };

  it('creates image understanding chunks and queues document embedding', async () => {
    const imageChunk = {
      id: 'image-chunk-1',
      title: '图片理解 / image1.png',
      content: '图片文字：VPN 申请单。',
      status: 'ACTIVE',
      position: 1,
      charCount: 13,
      metadata: {
        contentKind: 'IMAGE_UNDERSTANDING',
        assetFileId: 'asset-file-1',
        assetSource: 'DOCX_IMAGE',
      },
    };
    const documentUpdate = jest
      .fn<Promise<{ updatedAt: Date }>, [DocumentUpdateArgs]>()
      .mockResolvedValue({
        updatedAt: new Date('2026-05-31T00:00:00.000Z'),
      });
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'doc-1',
          knowledgeBaseId: 'kb-1',
          metadata: { assets: [asset] },
          knowledgeBase: {
            id: 'kb-1',
            status: 'ACTIVE',
            metadata: {},
            chunkSize: 1024,
            chunkOverlap: 128,
            embeddingModel,
            visionModel,
          },
        }),
        update: documentUpdate,
      },
      chunk: {
        findMany: jest.fn().mockResolvedValue([sourceChunk]),
      },
    };
    const documentAssetService = {
      createImageUnderstandingChunks: jest.fn().mockResolvedValue({
        chunks: [imageChunk],
        warnings: [],
      }),
    };
    const chunkIndexingService = {
      createChunks: jest.fn().mockResolvedValue(undefined),
      refreshDocumentSearchVector: jest.fn().mockResolvedValue(undefined),
      refreshDocumentStats: jest.fn().mockResolvedValue(undefined),
    };
    const documentProcessingJobService = {
      enqueueDocumentEmbedding: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DocumentImageUnderstandingService(
      prisma as never,
      documentAssetService as never,
      chunkIndexingService as never,
      documentProcessingJobService as never,
    );

    await service.processDocument({
      documentId: 'doc-1',
      knowledgeBaseId: 'kb-1',
    });

    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: { status: 'CHUNKING', errorMessage: null },
    });
    expect(
      documentAssetService.createImageUnderstandingChunks,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'kb-1', visionModel }),
      [asset],
      [sourceChunk],
    );
    expect(chunkIndexingService.createChunks).toHaveBeenCalledWith(
      'kb-1',
      'doc-1',
      [imageChunk],
    );
    expect(
      chunkIndexingService.refreshDocumentSearchVector,
    ).toHaveBeenCalledWith('doc-1');
    expect(chunkIndexingService.refreshDocumentStats).toHaveBeenCalledWith(
      'doc-1',
    );
    const lastDocumentUpdate = documentUpdate.mock.calls.at(-1)?.[0];

    expect(lastDocumentUpdate?.where).toEqual({ id: 'doc-1' });
    expect(lastDocumentUpdate?.data).toEqual({
      status: 'EMBEDDING',
      errorMessage: null,
      metadata: { assets: [asset] },
    });
    expect(
      documentProcessingJobService.enqueueDocumentEmbedding,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
      }),
    );
  });

  it('does not create duplicate image chunks for assets already understood', async () => {
    const existingImageChunk = {
      ...sourceChunk,
      id: 'image-chunk-1',
      title: '图片理解 / image1.png',
      metadata: {
        contentKind: 'IMAGE_UNDERSTANDING',
        assetFileId: 'asset-file-1',
      },
    };
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'doc-1',
          knowledgeBaseId: 'kb-1',
          metadata: { assets: [asset] },
          knowledgeBase: {
            id: 'kb-1',
            status: 'ACTIVE',
            metadata: {},
            chunkSize: 1024,
            chunkOverlap: 128,
            embeddingModel,
            visionModel,
          },
        }),
        update: jest.fn().mockResolvedValue({
          updatedAt: new Date('2026-05-31T00:00:00.000Z'),
        }),
      },
      chunk: {
        findMany: jest
          .fn()
          .mockResolvedValue([sourceChunk, existingImageChunk]),
      },
    };
    const documentAssetService = {
      createImageUnderstandingChunks: jest.fn(),
    };
    const chunkIndexingService = {
      createChunks: jest.fn(),
      refreshDocumentSearchVector: jest.fn(),
      refreshDocumentStats: jest.fn(),
    };
    const documentProcessingJobService = {
      enqueueDocumentEmbedding: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DocumentImageUnderstandingService(
      prisma as never,
      documentAssetService as never,
      chunkIndexingService as never,
      documentProcessingJobService as never,
    );

    await service.processDocument({
      documentId: 'doc-1',
      knowledgeBaseId: 'kb-1',
    });

    expect(
      documentAssetService.createImageUnderstandingChunks,
    ).not.toHaveBeenCalled();
    expect(chunkIndexingService.createChunks).not.toHaveBeenCalled();
    expect(
      documentProcessingJobService.enqueueDocumentEmbedding,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
      }),
    );
  });

  it('marks the document failed when image understanding crashes', async () => {
    const imageError = new Error('vision timeout');
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'doc-1',
          knowledgeBaseId: 'kb-1',
          metadata: { assets: [asset] },
          knowledgeBase: {
            id: 'kb-1',
            status: 'ACTIVE',
            metadata: {},
            chunkSize: 1024,
            chunkOverlap: 128,
            embeddingModel,
            visionModel,
          },
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      chunk: {
        findMany: jest.fn().mockResolvedValue([sourceChunk]),
      },
    };
    const documentAssetService = {
      createImageUnderstandingChunks: jest.fn().mockRejectedValue(imageError),
    };
    const chunkIndexingService = {
      createChunks: jest.fn(),
      refreshDocumentSearchVector: jest.fn(),
      refreshDocumentStats: jest.fn(),
    };
    const service = new DocumentImageUnderstandingService(
      prisma as never,
      documentAssetService as never,
      chunkIndexingService as never,
      {} as never,
    );

    await expect(
      service.processDocument({
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
      }),
    ).rejects.toThrow(imageError);

    expect(prisma.document.update).toHaveBeenLastCalledWith({
      where: { id: 'doc-1' },
      data: { status: 'FAILED', errorMessage: 'vision timeout' },
    });
  });

  it('marks the document failed when the embedding model is no longer usable', async () => {
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'doc-1',
          knowledgeBaseId: 'kb-1',
          metadata: { assets: [asset] },
          knowledgeBase: {
            id: 'kb-1',
            status: 'DISABLED',
            metadata: {},
            chunkSize: 1024,
            chunkOverlap: 128,
            embeddingModel,
            visionModel,
          },
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      chunk: {
        findMany: jest.fn(),
      },
    };
    const documentAssetService = {
      createImageUnderstandingChunks: jest.fn(),
    };
    const chunkIndexingService = {
      createChunks: jest.fn(),
      refreshDocumentSearchVector: jest.fn(),
      refreshDocumentStats: jest.fn(),
    };
    const service = new DocumentImageUnderstandingService(
      prisma as never,
      documentAssetService as never,
      chunkIndexingService as never,
      {} as never,
    );

    await expect(
      service.processDocument({
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
      }),
    ).rejects.toThrow('knowledge base is disabled');

    expect(prisma.document.update).toHaveBeenLastCalledWith({
      where: { id: 'doc-1' },
      data: {
        status: 'FAILED',
        errorMessage: 'knowledge base is disabled',
      },
    });
    expect(prisma.chunk.findMany).not.toHaveBeenCalled();
    expect(
      documentAssetService.createImageUnderstandingChunks,
    ).not.toHaveBeenCalled();
  });
});
