jest.mock('@libs/shared', () => ({
  FileParserService: class FileParserService {},
  FileStorageService: class FileStorageService {},
  PrismaService: class PrismaService {},
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
  },
  DocumentStatus: {
    CHUNKING: 'CHUNKING',
    EMBEDDING: 'EMBEDDING',
    OCR_PENDING: 'OCR_PENDING',
    INDEXED: 'INDEXED',
    FAILED: 'FAILED',
  },
  KnowledgeBaseStatus: {
    ACTIVE: 'ACTIVE',
    DISABLED: 'DISABLED',
  },
}));

import { DocumentImportService } from './document-import.service';
import { DocumentAssetService } from './document-asset.service';
import { ChunkIndexingService } from './chunk-indexing.service';

type CreatedChunk = {
  id: string;
  title: string | null;
  content: string;
  position: number;
  status: string;
  charCount: number;
  metadata: Record<string, unknown>;
};

type CreateManyChunksArgs = {
  data: CreatedChunk[];
};

type DocumentUpdateArgs = {
  where: { id: string };
  data: {
    charCount?: number;
    chunkCount?: number;
    metadata?: {
      assets?: Array<{
        fileId?: string;
        originalReference?: string;
        reference?: string;
      }>;
    };
  };
};

describe('DocumentImportService', () => {
  it('uses knowledge base chunk size and overlap when previewing files', async () => {
    const fileParser = {
      parse: jest.fn().mockResolvedValue({
        fileName: '制度.md',
        documentName: '制度',
        sourceFormat: 'MARKDOWN',
        chunks: [
          {
            title: '制度',
            content: '正文',
            status: 'ACTIVE',
          },
        ],
      }),
    };
    const prisma = {
      knowledgeBase: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'kb-1',
          chunkSize: 12,
          chunkOverlap: 3,
        }),
      },
    };
    const service = new DocumentImportService(
      prisma as never,
      {} as never,
      fileParser as never,
      {} as never,
      {} as never,
    );

    await service.previewDocumentFiles('kb-1', [
      {
        originalname: '制度.md',
        mimetype: 'text/markdown',
        size: 12,
        buffer: Buffer.from('# 制度\n正文'),
      },
    ]);

    expect(fileParser.parse).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: '制度.md' }),
      expect.objectContaining({
        maxChunkLength: 12,
        overlapLength: 3,
        maxChunkCount: 200,
      }),
    );
  });

  it('removes the saved source file when document creation fails', async () => {
    const createError = new Error('document create failed');
    const prisma = {
      knowledgeBase: {
        findUnique: jest.fn().mockResolvedValue({
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
          visionModel: null,
        }),
      },
      document: {
        create: jest.fn().mockRejectedValue(createError),
        update: jest.fn(),
      },
    };
    const fileStorageService = {
      saveBuffer: jest.fn().mockResolvedValue({
        id: 'source-file-1',
        fileName: '制度.md',
        mimeType: 'text/markdown',
        fileSize: 12,
        sha256Hash: 'source-hash',
      }),
      removeFileIfUnreferenced: jest.fn().mockResolvedValue(undefined),
    };
    const fileParser = {
      parse: jest.fn().mockResolvedValue({
        fileName: '制度.md',
        documentName: '制度',
        sourceFormat: 'MARKDOWN',
        chunks: [
          {
            title: '制度',
            content: '正文',
            status: 'ACTIVE',
          },
        ],
      }),
    };
    const documentAssetService = {
      saveParsedAssets: jest.fn(),
      rewriteChunkAssetReferences: jest.fn(),
      createImageUnderstandingChunks: jest.fn(),
    };
    const chunkIndexingService = {
      createChunks: jest.fn(),
      refreshDocumentSearchVector: jest.fn(),
      rebuildDocumentEmbeddings: jest.fn(),
    };
    const service = new DocumentImportService(
      prisma as never,
      fileStorageService as never,
      fileParser as never,
      documentAssetService as never,
      chunkIndexingService as never,
    );

    await expect(
      service.createFileDocuments(
        'kb-1',
        [
          {
            originalname: '制度.md',
            mimetype: 'text/markdown',
            size: 12,
            buffer: Buffer.from('# 制度\n正文'),
          },
        ],
        {
          documents: [
            {
              fileIndex: 0,
              name: '制度',
              chunks: [
                {
                  title: '制度',
                  content: '正文',
                  status: 'ACTIVE',
                },
              ],
            },
          ],
        },
      ),
    ).rejects.toThrow(createError);

    expect(fileStorageService.removeFileIfUnreferenced).toHaveBeenCalledWith(
      'source-file-1',
    );
    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(documentAssetService.saveParsedAssets).not.toHaveBeenCalled();
    expect(chunkIndexingService.createChunks).not.toHaveBeenCalled();
  });

  it('marks the document as failed and preserves the source file when embedding job enqueue fails', async () => {
    const enqueueError = new Error('queue unavailable');
    type DocumentUpdateInput = {
      where: { id: string };
      data: Record<string, unknown>;
    };
    const prisma = {
      knowledgeBase: {
        findUnique: jest.fn().mockResolvedValue({
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
          visionModel: null,
        }),
      },
      document: {
        create: jest.fn().mockResolvedValue({
          id: 'doc-1',
          knowledgeBaseId: 'kb-1',
          sourceFileId: 'source-file-1',
          name: '制度',
          sourceType: 'FILE_UPLOAD',
          status: 'CHUNKING',
          charCount: 2,
          chunkCount: 1,
          errorMessage: null,
          metadata: {},
          createdAt: new Date('2026-05-31T00:00:00.000Z'),
          updatedAt: new Date('2026-05-31T00:00:00.000Z'),
        }),
        update: jest
          .fn<Promise<unknown>, [DocumentUpdateInput]>()
          .mockResolvedValue({
            id: 'doc-1',
            knowledgeBaseId: 'kb-1',
            sourceFileId: 'source-file-1',
            name: '制度',
            sourceType: 'FILE_UPLOAD',
            status: 'FAILED',
            charCount: 2,
            chunkCount: 1,
            errorMessage: 'embedding failed',
            metadata: {},
            createdAt: new Date('2026-05-31T00:00:00.000Z'),
            updatedAt: new Date('2026-05-31T00:00:00.000Z'),
          }),
      },
    };
    const fileStorageService = {
      saveBuffer: jest.fn().mockResolvedValue({
        id: 'source-file-1',
        fileName: '制度.md',
        mimeType: 'text/markdown',
        fileSize: 12,
        sha256Hash: 'source-hash',
      }),
      removeFileIfUnreferenced: jest.fn(),
    };
    const fileParser = {
      parse: jest.fn().mockResolvedValue({
        fileName: '制度.md',
        documentName: '制度',
        sourceFormat: 'MARKDOWN',
        chunks: [
          {
            title: '制度',
            content: '正文',
            status: 'ACTIVE',
          },
        ],
      }),
    };
    const documentAssetService = {
      saveParsedAssets: jest.fn().mockResolvedValue([]),
      rewriteChunkAssetReferences: jest.fn(),
      createImageUnderstandingChunks: jest.fn(),
    };
    const chunkIndexingService = {
      createChunks: jest.fn().mockResolvedValue(undefined),
      refreshDocumentSearchVector: jest.fn().mockResolvedValue(undefined),
      rebuildDocumentEmbeddings: jest.fn(),
    };
    const documentProcessingJobService = {
      enqueueDocumentEmbedding: jest.fn().mockRejectedValue(enqueueError),
    };
    const service = new DocumentImportService(
      prisma as never,
      fileStorageService as never,
      fileParser as never,
      documentAssetService as never,
      chunkIndexingService as never,
      documentProcessingJobService as never,
    );

    await expect(
      service.createFileDocuments(
        'kb-1',
        [
          {
            originalname: '制度.md',
            mimetype: 'text/markdown',
            size: 12,
            buffer: Buffer.from('# 制度\n正文'),
          },
        ],
        {
          documents: [
            {
              fileIndex: 0,
              name: '制度',
              chunks: [
                {
                  title: '制度',
                  content: '正文',
                  status: 'ACTIVE',
                },
              ],
            },
          ],
        },
      ),
    ).rejects.toThrow(enqueueError);

    expect(fileStorageService.removeFileIfUnreferenced).not.toHaveBeenCalled();
    expect(prisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1' },
        data: { status: 'EMBEDDING', errorMessage: null },
      }),
    );
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: { status: 'FAILED', errorMessage: 'queue unavailable' },
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

  it('queues image understanding for saved document images', async () => {
    const createdChunks: CreatedChunk[] = [];
    type DocumentCreateInput = {
      data: { status: string; sourceType: string; name: string };
    };
    type DocumentUpdateInput = {
      where: { id: string };
      data: Record<string, unknown>;
    };
    const prisma = {
      knowledgeBase: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'kb-1',
          status: 'ACTIVE',
          metadata: {
            imageUnderstandingPrompt: '提取图片中的文字并总结业务信息。',
          },
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
          visionModel: {
            id: 'vision-1',
            type: 'IMAGE',
            isEnabled: true,
            modelName: 'qwen-vl-max',
            baseUrl: 'https://vision.example.com/v1',
            apiKey: 'sk-vision',
            configJson: {},
          },
        }),
      },
      document: {
        create: jest
          .fn<Promise<unknown>, [DocumentCreateInput]>()
          .mockResolvedValue({
            id: 'doc-1',
            knowledgeBaseId: 'kb-1',
            sourceFileId: 'source-file-1',
            name: '图文材料',
            sourceType: 'FILE_UPLOAD',
            status: 'CHUNKING',
            charCount: 0,
            chunkCount: 0,
            errorMessage: null,
            metadata: {},
            createdAt: new Date('2026-05-31T00:00:00.000Z'),
            updatedAt: new Date('2026-05-31T00:00:00.000Z'),
          }),
        update: jest
          .fn<Promise<unknown>, [DocumentUpdateInput]>()
          .mockResolvedValue({
            id: 'doc-1',
            knowledgeBaseId: 'kb-1',
            sourceFileId: 'source-file-1',
            name: '图文材料',
            sourceType: 'FILE_UPLOAD',
            status: 'CHUNKING',
            charCount: '![流程图](./files/asset-file-1)'.length,
            chunkCount: 1,
            errorMessage: null,
            metadata: {
              assets: [
                {
                  source: 'DOCX_IMAGE',
                  fileId: 'asset-file-1',
                  fileName: 'image1.png',
                  mimeType: 'image/png',
                  fileSize: 64,
                  sha256Hash: 'asset-hash',
                  originalReference: './files/image1.png',
                  reference: './files/asset-file-1',
                },
              ],
            },
            createdAt: new Date('2026-05-31T00:00:00.000Z'),
            updatedAt: new Date('2026-05-31T00:00:00.000Z'),
          }),
      },
      chunk: {
        createMany: jest
          .fn<Promise<{ count: number }>, [CreateManyChunksArgs]>()
          .mockImplementation(({ data }) => {
            createdChunks.push(...data);

            return Promise.resolve({ count: data.length });
          }),
        findMany: jest.fn().mockImplementation(() =>
          Promise.resolve(
            createdChunks.map((chunk) => ({
              id: chunk.id,
              title: chunk.title,
              content: chunk.content,
              metadata: chunk.metadata,
              document: {
                name: '图文材料',
                metadata: {},
              },
            })),
          ),
        ),
      },
      chunkEmbedding: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (db: unknown) => Promise<unknown>) =>
          callback(prisma),
        ),
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    const embeddingService = {
      embedInputs: jest
        .fn()
        .mockImplementation((_model, inputs: unknown[]) =>
          Promise.resolve(inputs.map(() => [0.1, 0.2, 0.3])),
        ),
    };
    const fileStorageService = {
      saveBuffer: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'source-file-1',
          fileName: '图文材料.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileSize: 1024,
          sha256Hash: 'source-hash',
        })
        .mockResolvedValueOnce({
          id: 'asset-file-1',
          fileName: 'image1.png',
          mimeType: 'image/png',
          fileSize: 64,
          sha256Hash: 'asset-hash',
        }),
      readBuffer: jest.fn().mockResolvedValue({
        mimeType: 'image/png',
        buffer: Buffer.from('image-bytes'),
      }),
    };
    const fileParser = {
      parse: jest.fn().mockResolvedValue({
        fileName: '图文材料.docx',
        documentName: '图文材料',
        sourceFormat: 'DOCX',
        chunks: [
          {
            title: '图文材料',
            content: '![流程图](./files/image1.png)',
            status: 'ACTIVE',
            metadata: {
              assetReference: './files/image1.png',
            },
          },
        ],
        assets: [
          {
            source: 'DOCX_IMAGE',
            fileName: 'image1.png',
            mimeType: 'image/png',
            reference: './files/image1.png',
            buffer: Buffer.from('image-bytes'),
          },
        ],
      }),
    };
    const imageUnderstandingService = {
      understandImage: jest
        .fn()
        .mockResolvedValue('图片文字：VPN 申请单。业务信息：需要主管审批。'),
    };
    const documentAssetService = new DocumentAssetService(
      fileStorageService as never,
      imageUnderstandingService as never,
    );
    const chunkIndexingService = new ChunkIndexingService(
      prisma as never,
      embeddingService as never,
      fileStorageService as never,
    );
    const documentProcessingJobService = {
      enqueueDocumentEmbedding: jest.fn().mockResolvedValue(undefined),
      enqueueImageUnderstanding: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DocumentImportService(
      prisma as never,
      fileStorageService as never,
      fileParser as never,
      documentAssetService,
      chunkIndexingService,
      documentProcessingJobService as never,
    );

    const result = await service.createFileDocuments(
      'kb-1',
      [
        {
          originalname: '图文材料.docx',
          mimetype:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 1024,
          buffer: Buffer.from('pdf-bytes'),
        },
      ],
      {
        documents: [
          {
            fileIndex: 0,
            name: '图文材料',
            chunks: [
              {
                title: '图文材料',
                content: '![流程图](./files/image1.png)',
                status: 'ACTIVE',
                metadata: {
                  assetReference: './files/image1.png',
                },
              },
            ],
          },
        ],
      },
    );

    const documentCreateInput = prisma.document.create.mock.calls[0]?.[0];
    const documentUpdateInputs: DocumentUpdateArgs[] =
      prisma.document.update.mock.calls.map(([input]) => input);
    const lastDocumentUpdateInput = documentUpdateInputs.at(-1);

    expect(documentCreateInput?.data.status).toBe('CHUNKING');
    expect(documentCreateInput?.data.sourceType).toBe('FILE_UPLOAD');
    expect(documentCreateInput?.data.name).toBe('图文材料');
    expect(documentUpdateInputs).toHaveLength(1);
    expect(lastDocumentUpdateInput?.where).toEqual({ id: 'doc-1' });
    expect(lastDocumentUpdateInput?.data.charCount).toBe(
      '![流程图](./files/asset-file-1)'.length,
    );
    expect(lastDocumentUpdateInput?.data.chunkCount).toBe(1);
    expect(lastDocumentUpdateInput?.data.metadata?.assets?.[0]).toMatchObject({
      fileId: 'asset-file-1',
      originalReference: './files/image1.png',
      reference: './files/asset-file-1',
    });
    expect(fileStorageService.readBuffer).not.toHaveBeenCalled();
    expect(imageUnderstandingService.understandImage).not.toHaveBeenCalled();
    const originalPageChunk = createdChunks.find(
      (chunk) => chunk.title === '图文材料',
    );

    expect(originalPageChunk).toEqual(
      expect.objectContaining({
        title: '图文材料',
        content: '![流程图](./files/asset-file-1)',
        position: 0,
        status: 'ACTIVE',
        charCount: '![流程图](./files/asset-file-1)'.length,
      }),
    );
    expect(originalPageChunk?.metadata).toEqual(
      expect.objectContaining({
        assetReference: './files/asset-file-1',
        assetFileId: 'asset-file-1',
        assetSource: 'DOCX_IMAGE',
      }),
    );
    expect(createdChunks).toHaveLength(1);
    expect(embeddingService.embedInputs).not.toHaveBeenCalled();
    expect(
      documentProcessingJobService.enqueueImageUnderstanding,
    ).toHaveBeenCalledWith({
      documentId: 'doc-1',
      knowledgeBaseId: 'kb-1',
    });
    expect(
      documentProcessingJobService.enqueueDocumentEmbedding,
    ).not.toHaveBeenCalled();
    expect(result.documents).toEqual([
      expect.objectContaining({
        id: 'doc-1',
        name: '图文材料',
        status: 'CHUNKING',
      }),
    ]);
  });

  it('queues image-only PDF documents for OCR instead of indexing them synchronously', async () => {
    type DocumentCreateInput = {
      data: { status: string; sourceType: string; name: string };
    };
    const prisma = {
      knowledgeBase: {
        findUnique: jest.fn().mockResolvedValue({
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
          visionModel: null,
        }),
      },
      document: {
        create: jest
          .fn<Promise<unknown>, [DocumentCreateInput]>()
          .mockResolvedValue({
            id: 'doc-1',
            knowledgeBaseId: 'kb-1',
            sourceFileId: 'source-file-1',
            name: '扫描件',
            sourceType: 'FILE_UPLOAD',
            status: 'OCR_PENDING',
            charCount: 0,
            chunkCount: 0,
            errorMessage: null,
            metadata: {},
            createdAt: new Date('2026-05-31T00:00:00.000Z'),
            updatedAt: new Date('2026-05-31T00:00:00.000Z'),
          }),
        update: jest.fn(),
      },
    };
    const fileStorageService = {
      saveBuffer: jest.fn().mockResolvedValue({
        id: 'source-file-1',
        fileName: '扫描件.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        sha256Hash: 'source-hash',
      }),
      removeFileIfUnreferenced: jest.fn(),
    };
    const fileParser = {
      parse: jest.fn().mockResolvedValue({
        fileName: '扫描件.pdf',
        documentName: '扫描件',
        sourceFormat: 'PDF',
        chunks: [
          {
            title: '扫描件 / 第 1 页',
            content: '![扫描件 第 1 页](./files/page-1.png)',
            status: 'ACTIVE',
            metadata: {
              contentKind: 'PDF_PAGE_IMAGE',
              assetReference: './files/page-1.png',
              pageNumber: 1,
            },
          },
        ],
        assets: [
          {
            source: 'PDF_PAGE_SCREENSHOT',
            fileName: 'page-1.png',
            mimeType: 'image/png',
            reference: './files/page-1.png',
            buffer: Buffer.from('image-bytes'),
          },
        ],
      }),
    };
    const documentAssetService = {
      saveParsedAssets: jest.fn(),
      rewriteChunkAssetReferences: jest.fn(),
      createImageUnderstandingChunks: jest.fn(),
    };
    const chunkIndexingService = {
      createChunks: jest.fn(),
      refreshDocumentSearchVector: jest.fn(),
      rebuildDocumentEmbeddings: jest.fn(),
    };
    const documentProcessingJobService = {
      enqueueOcrDocument: jest.fn().mockResolvedValue(undefined),
    };
    const service = new (DocumentImportService as unknown as new (
      ...args: unknown[]
    ) => DocumentImportService)(
      prisma,
      fileStorageService,
      fileParser,
      documentAssetService,
      chunkIndexingService,
      documentProcessingJobService,
    );

    const result = await service.createFileDocuments(
      'kb-1',
      [
        {
          originalname: '扫描件.pdf',
          mimetype: 'application/pdf',
          size: 1024,
          buffer: Buffer.from('pdf-bytes'),
        },
      ],
      {
        documents: [
          {
            fileIndex: 0,
            name: '扫描件',
            chunks: [
              {
                title: '扫描件 / 第 1 页',
                content: '![扫描件 第 1 页](./files/page-1.png)',
                status: 'ACTIVE',
                metadata: {
                  contentKind: 'PDF_PAGE_IMAGE',
                  assetReference: './files/page-1.png',
                  pageNumber: 1,
                },
              },
            ],
          },
        ],
      },
    );

    const documentCreateInput = prisma.document.create.mock.calls[0]?.[0];

    expect(documentCreateInput?.data.status).toBe('OCR_PENDING');
    expect(documentCreateInput?.data.charCount).toBe(0);
    expect(documentCreateInput?.data.chunkCount).toBe(0);
    expect(
      documentProcessingJobService.enqueueOcrDocument,
    ).toHaveBeenCalledWith({
      documentId: 'doc-1',
      knowledgeBaseId: 'kb-1',
      sourceFileId: 'source-file-1',
    });
    expect(documentAssetService.saveParsedAssets).not.toHaveBeenCalled();
    expect(chunkIndexingService.createChunks).not.toHaveBeenCalled();
    expect(
      chunkIndexingService.rebuildDocumentEmbeddings,
    ).not.toHaveBeenCalled();
    expect(result.documents).toEqual([
      expect.objectContaining({
        id: 'doc-1',
        name: '扫描件',
        status: 'OCR_PENDING',
      }),
    ]);
  });
});
