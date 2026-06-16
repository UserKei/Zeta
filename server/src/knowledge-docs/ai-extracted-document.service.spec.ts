jest.mock('@libs/shared', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('@libs/shared/generated/prisma/enums', () => ({
  AiModelType: {
    EMBEDDING: 'EMBEDDING',
  },
  ChunkStatus: {
    ACTIVE: 'ACTIVE',
    DISABLED: 'DISABLED',
  },
  DocumentSourceType: {
    AI_EXTRACTED: 'AI_EXTRACTED',
  },
  DocumentStatus: {
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

import { BadRequestException } from '@nestjs/common';
import { AiExtractedDocumentService } from './ai-extracted-document.service';

describe('AiExtractedDocumentService', () => {
  type DocumentCreateArg = {
    data: {
      name: string;
      sourceType: string;
      status: string;
      metadata: Record<string, unknown>;
    };
  };
  type ChunkCreateArg = {
    data: {
      knowledgeBaseId: string;
      documentId: string;
      title: string | null;
      content: string;
      status: string;
      charCount: number;
    };
  };
  const embeddingModel = {
    id: 'embedding-1',
    type: 'EMBEDDING',
    isEnabled: true,
    modelName: 'text-embedding-v4',
    baseUrl: 'https://embedding.example.com/v1',
    apiKey: 'sk-embedding',
    configJson: {},
  };

  it('creates the default AI extracted document and indexes a chunk', async () => {
    const documentCreate = jest
      .fn<Promise<{ id: string }>, [DocumentCreateArg]>()
      .mockResolvedValue({ id: 'doc-1' });
    const chunkCreate = jest
      .fn<Promise<unknown>, [ChunkCreateArg]>()
      .mockResolvedValue({
        id: 'chunk-1',
        knowledgeBaseId: 'kb-1',
        documentId: 'doc-1',
        title: 'VPN 申请',
        content: 'VPN 需要直属主管审批。',
        position: 0,
        tokenCount: null,
        charCount: 13,
        status: 'ACTIVE',
        metadata: {},
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      });
    const embeddingDocument = {
      id: 'doc-1',
      knowledgeBaseId: 'kb-1',
      sourceFileId: null,
      name: '聊天补充知识',
      sourceType: 'AI_EXTRACTED',
      status: 'EMBEDDING',
      charCount: 13,
      chunkCount: 1,
      errorMessage: null,
      metadata: {
        description: '从 Agent 聊天记录标注入库的知识',
        sourceMessageId: 'message-1',
      },
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    };
    const prisma = {
      knowledgeBase: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'kb-1',
          status: 'ACTIVE',
          metadata: {},
          chunkSize: 1024,
          chunkOverlap: 128,
          embeddingModel,
          visionModel: null,
        }),
      },
      document: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: documentCreate,
        findUnique: jest.fn().mockResolvedValue(embeddingDocument),
        update: jest.fn().mockResolvedValue(embeddingDocument),
      },
      chunk: {
        count: jest.fn().mockResolvedValue(0),
        create: chunkCreate,
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'chunk-1',
          knowledgeBaseId: 'kb-1',
          documentId: 'doc-1',
          title: 'VPN 申请',
          content: 'VPN 需要直属主管审批。',
          position: 0,
          tokenCount: null,
          charCount: 13,
          status: 'ACTIVE',
          metadata: {},
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
          updatedAt: new Date('2026-06-01T00:00:00.000Z'),
        }),
      },
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            knowledgeBase: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'kb-1',
                status: 'ACTIVE',
                metadata: {},
                chunkSize: 1024,
                chunkOverlap: 128,
                embeddingModel,
                visionModel: null,
              }),
            },
            document: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: documentCreate,
              findUnique: jest
                .fn()
                .mockResolvedValueOnce({
                  id: 'doc-1',
                  knowledgeBaseId: 'kb-1',
                  knowledgeBase: {
                    id: 'kb-1',
                    status: 'ACTIVE',
                    metadata: {},
                    chunkSize: 1024,
                    chunkOverlap: 128,
                    embeddingModel,
                    visionModel: null,
                  },
                })
                .mockResolvedValueOnce(embeddingDocument),
            },
            chunk: {
              count: jest.fn().mockResolvedValue(0),
              create: chunkCreate,
            },
          }),
      ),
    };
    const chunkIndexingService = {
      refreshChunkSearchVector: jest.fn(),
      syncChunkEmbedding: jest.fn(),
      refreshIndexedDocumentStats: jest.fn(),
      refreshDocumentStats: jest.fn(),
    };
    const documentProcessingJobService = {
      enqueueDocumentEmbedding: jest.fn(),
    };
    const service = new AiExtractedDocumentService(
      prisma as never,
      chunkIndexingService as never,
      documentProcessingJobService as never,
    );

    const result = await service.createChunk('kb-1', {
      title: 'VPN 申请',
      content: 'VPN 需要直属主管审批。',
      sourceMessageId: 'message-1',
    });

    expect(documentCreate.mock.calls[0]?.[0].data).toMatchObject({
      name: '聊天补充知识',
      sourceType: 'AI_EXTRACTED',
      status: 'CHUNKING',
      metadata: {
        description: '从 Agent 聊天记录标注入库的知识',
        sourceMessageId: 'message-1',
      },
    });
    expect(chunkCreate.mock.calls[0]?.[0].data).toMatchObject({
      knowledgeBaseId: 'kb-1',
      documentId: 'doc-1',
      title: 'VPN 申请',
      content: 'VPN 需要直属主管审批。',
      status: 'ACTIVE',
      charCount: 13,
    });
    expect(chunkIndexingService.refreshChunkSearchVector).toHaveBeenCalledWith(
      'chunk-1',
    );
    expect(chunkIndexingService.refreshDocumentStats).toHaveBeenCalledWith(
      'doc-1',
    );
    expect(chunkIndexingService.syncChunkEmbedding).not.toHaveBeenCalled();
    expect(
      chunkIndexingService.refreshIndexedDocumentStats,
    ).not.toHaveBeenCalled();
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: { status: 'EMBEDDING', errorMessage: null },
      select: { updatedAt: true },
    });
    expect(
      documentProcessingJobService.enqueueDocumentEmbedding,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
      }),
    );
    expect(result.document).toEqual(
      expect.objectContaining({
        id: 'doc-1',
        description: '从 Agent 聊天记录标注入库的知识',
      }),
    );
    expect(result.chunk).toEqual(expect.objectContaining({ id: 'chunk-1' }));
  });

  it('rejects a target document from another knowledge base', async () => {
    const prisma = {
      knowledgeBase: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'kb-1',
          status: 'ACTIVE',
          metadata: {},
          chunkSize: 1024,
          chunkOverlap: 128,
          embeddingModel,
          visionModel: null,
        }),
      },
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'doc-2',
          knowledgeBaseId: 'other-kb',
          knowledgeBase: {
            id: 'other-kb',
            status: 'ACTIVE',
            metadata: {},
            chunkSize: 1024,
            chunkOverlap: 128,
            embeddingModel,
            visionModel: null,
          },
        }),
      },
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            knowledgeBase: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'kb-1',
                status: 'ACTIVE',
                metadata: {},
                chunkSize: 1024,
                chunkOverlap: 128,
                embeddingModel,
                visionModel: null,
              }),
            },
            document: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'doc-2',
                knowledgeBaseId: 'other-kb',
                knowledgeBase: {
                  id: 'other-kb',
                  status: 'ACTIVE',
                  metadata: {},
                  chunkSize: 1024,
                  chunkOverlap: 128,
                  embeddingModel,
                  visionModel: null,
                },
              }),
            },
          }),
      ),
    };
    const service = new AiExtractedDocumentService(
      prisma as never,
      {} as never,
    );

    await expect(
      service.createChunk('kb-1', {
        documentId: 'doc-2',
        content: '补充内容',
        sourceMessageId: 'message-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
