jest.mock('@libs/shared/generated/prisma/enums', () => ({
  AiModelType: {
    EMBEDDING: 'EMBEDDING',
  },
  ChunkStatus: {
    ACTIVE: 'ACTIVE',
    DISABLED: 'DISABLED',
  },
  DocumentStatus: {
    OCR_PROCESSING: 'OCR_PROCESSING',
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

jest.mock('@libs/shared', () => ({
  FileParserService: class FileParserService {},
  FileStorageService: class FileStorageService {},
  PrismaService: class PrismaService {},
}));

import { DocumentOcrService } from './document-ocr.service';

describe('DocumentOcrService', () => {
  it('indexes OCR markdown through chunks and queues embedding generation', async () => {
    const document = {
      id: 'doc-1',
      knowledgeBaseId: 'kb-1',
      sourceFileId: 'source-file-1',
      name: '扫描制度',
      metadata: { sourceFormat: 'PDF' },
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
    };
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue(document),
        update: jest.fn().mockResolvedValue({
          updatedAt: new Date('2026-05-31T00:00:00.000Z'),
        }),
      },
      chunk: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      chunkEmbedding: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const fileStorageService = {
      readBuffer: jest.fn().mockResolvedValue({
        id: 'source-file-1',
        fileName: '扫描制度.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024n,
        buffer: Buffer.from('pdf-bytes'),
      }),
    };
    const ocrClient = {
      recognizePdf: jest.fn().mockResolvedValue({
        markdown: '# 扫描制度\n\nVPN 申请需要主管审批。',
      }),
    };
    const fileParser = {
      parse: jest.fn().mockResolvedValue({
        fileName: '扫描制度.ocr.md',
        documentName: '扫描制度',
        sourceFormat: 'MARKDOWN',
        chunks: [
          {
            title: '扫描制度',
            content: 'VPN 申请需要主管审批。',
            status: 'ACTIVE',
          },
        ],
      }),
    };
    const chunkIndexingService = {
      createChunks: jest.fn().mockResolvedValue(undefined),
      refreshDocumentSearchVector: jest.fn().mockResolvedValue(undefined),
      rebuildDocumentEmbeddings: jest.fn(),
    };
    const documentProcessingJobService = {
      enqueueDocumentEmbedding: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DocumentOcrService(
      prisma as never,
      fileStorageService as never,
      ocrClient as never,
      fileParser as never,
      chunkIndexingService as never,
      documentProcessingJobService as never,
    );

    await service.processDocument({
      documentId: 'doc-1',
      knowledgeBaseId: 'kb-1',
      sourceFileId: 'source-file-1',
    });

    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: { status: 'OCR_PROCESSING', errorMessage: null },
    });
    expect(fileStorageService.readBuffer).toHaveBeenCalledWith('source-file-1');
    expect(ocrClient.recognizePdf).toHaveBeenCalledWith({
      fileName: '扫描制度.pdf',
      buffer: Buffer.from('pdf-bytes'),
    });
    expect(fileParser.parse).toHaveBeenCalledWith(
      {
        fileName: '扫描制度.ocr.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('# 扫描制度\n\nVPN 申请需要主管审批。'),
      },
      {
        maxChunkLength: 1024,
        overlapLength: 128,
        maxChunkCount: 200,
      },
    );
    expect(prisma.chunk.deleteMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1' },
    });
    expect(prisma.chunkEmbedding.deleteMany).toHaveBeenCalledWith({
      where: { chunk: { documentId: 'doc-1' } },
    });
    expect(chunkIndexingService.createChunks).toHaveBeenCalledWith(
      'kb-1',
      'doc-1',
      [
        expect.objectContaining({
          title: '扫描制度',
          content: 'VPN 申请需要主管审批。',
          position: 0,
          charCount: 'VPN 申请需要主管审批。'.length,
        }),
      ],
    );
    expect(
      chunkIndexingService.refreshDocumentSearchVector,
    ).toHaveBeenCalledWith('doc-1');
    expect(prisma.document.update).toHaveBeenLastCalledWith({
      where: { id: 'doc-1' },
      data: {
        status: 'EMBEDDING',
        charCount: 'VPN 申请需要主管审批。'.length,
        chunkCount: 1,
        errorMessage: null,
        metadata: {
          sourceFormat: 'PDF',
          ocr: {
            status: 'completed',
          },
        },
      },
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
    expect(
      chunkIndexingService.rebuildDocumentEmbeddings,
    ).not.toHaveBeenCalled();
  });

  it('marks the document as failed when OCR processing fails', async () => {
    const ocrError = new Error('ocr timeout');
    const document = {
      id: 'doc-1',
      sourceFileId: 'source-file-1',
      name: '扫描制度',
      metadata: { sourceFormat: 'PDF' },
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
    };
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue(document),
        update: jest.fn().mockResolvedValue(undefined),
      },
      chunk: {
        deleteMany: jest.fn(),
      },
      chunkEmbedding: {
        deleteMany: jest.fn(),
      },
    };
    const fileStorageService = {
      readBuffer: jest.fn().mockResolvedValue({
        fileName: '扫描制度.pdf',
        buffer: Buffer.from('pdf-bytes'),
      }),
    };
    const ocrClient = {
      recognizePdf: jest.fn().mockRejectedValue(ocrError),
    };
    const fileParser = {
      parse: jest.fn(),
    };
    const chunkIndexingService = {
      createChunks: jest.fn(),
      refreshDocumentSearchVector: jest.fn(),
      rebuildDocumentEmbeddings: jest.fn(),
    };
    const documentProcessingJobService = {
      enqueueDocumentEmbedding: jest.fn(),
    };
    const service = new DocumentOcrService(
      prisma as never,
      fileStorageService as never,
      ocrClient as never,
      fileParser as never,
      chunkIndexingService as never,
      documentProcessingJobService as never,
    );

    await expect(
      service.processDocument({
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
        sourceFileId: 'source-file-1',
      }),
    ).rejects.toThrow(ocrError);

    expect(prisma.document.update).toHaveBeenLastCalledWith({
      where: { id: 'doc-1' },
      data: {
        status: 'FAILED',
        errorMessage: 'ocr timeout',
        metadata: {
          sourceFormat: 'PDF',
          ocr: {
            status: 'failed',
          },
        },
      },
    });
    expect(fileParser.parse).not.toHaveBeenCalled();
    expect(chunkIndexingService.createChunks).not.toHaveBeenCalled();
    expect(
      documentProcessingJobService.enqueueDocumentEmbedding,
    ).not.toHaveBeenCalled();
  });
});
