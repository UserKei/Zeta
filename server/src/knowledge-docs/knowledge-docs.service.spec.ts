jest.mock('@libs/shared', () => ({
  FileParserService: class FileParserService {},
  FileStorageService: class FileStorageService {},
  PrismaService: class PrismaService {},
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

type CreatedChunk = {
  id: string;
  title: string | null;
  content: string;
  metadata: Record<string, unknown>;
};

type CreateManyChunksArgs = {
  data: CreatedChunk[];
};

describe('KnowledgeDocsService image understanding chunks', () => {
  const createService = () => {
    const createdChunks: CreatedChunk[] = [];
    const prisma = {
      knowledgeBase: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'kb-1',
          status: 'ACTIVE',
          metadata: {
            imageUnderstandingPrompt: '提取图片中的文字并总结业务信息。',
          },
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
        create: jest.fn().mockResolvedValue({
          id: 'doc-1',
          knowledgeBaseId: 'kb-1',
          sourceFileId: 'source-file-1',
          name: '扫描件',
          sourceType: 'FILE_UPLOAD',
          status: 'CHUNKING',
          charCount: 0,
          chunkCount: 0,
          errorMessage: null,
          metadata: {},
          createdAt: new Date('2026-05-31T00:00:00.000Z'),
          updatedAt: new Date('2026-05-31T00:00:00.000Z'),
        }),
        update: jest.fn().mockResolvedValue({
          id: 'doc-1',
          knowledgeBaseId: 'kb-1',
          sourceFileId: 'source-file-1',
          name: '扫描件',
          sourceType: 'FILE_UPLOAD',
          status: 'INDEXED',
          charCount: 80,
          chunkCount: 2,
          errorMessage: null,
          metadata: {},
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
            })),
          ),
        ),
      },
      chunkEmbedding: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
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
          fileName: '扫描件.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          sha256Hash: 'source-hash',
        })
        .mockResolvedValueOnce({
          id: 'asset-file-1',
          fileName: 'page-1.png',
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
    const imageUnderstandingService = {
      understandImage: jest
        .fn()
        .mockResolvedValue('图片文字：VPN 申请单。业务信息：需要主管审批。'),
    };
    const retrievalService = {};
    const service = new KnowledgeDocsService(
      prisma as never,
      embeddingService as never,
      fileStorageService as never,
      fileParser as never,
      retrievalService as never,
      imageUnderstandingService as never,
    );

    return {
      service,
      prisma,
      imageUnderstandingService,
      fileStorageService,
      createdChunks,
    };
  };

  it('creates image understanding chunks for saved PDF page images', async () => {
    const {
      service,
      imageUnderstandingService,
      fileStorageService,
      createdChunks,
    } = createService();

    await service.createFileDocuments(
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

    expect(fileStorageService.readBuffer).toHaveBeenCalledWith('asset-file-1');
    expect(imageUnderstandingService.understandImage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'vision-1', modelName: 'qwen-vl-max' }),
      {
        dataUrl: 'data:image/png;base64,aW1hZ2UtYnl0ZXM=',
        prompt: '提取图片中的文字并总结业务信息。',
      },
    );
    expect(createdChunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '图片理解 / 第 1 页',
          content: '图片文字：VPN 申请单。业务信息：需要主管审批。',
          metadata: {
            contentKind: 'IMAGE_UNDERSTANDING',
            assetFileId: 'asset-file-1',
            assetSource: 'PDF_PAGE_SCREENSHOT',
          },
        }),
      ]),
    );
  });
});

describe('KnowledgeDocsService parser chunk settings', () => {
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
    const service = new KnowledgeDocsService(
      prisma as never,
      {} as never,
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
});

describe('KnowledgeDocsService manual documents', () => {
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
    const embeddingService = {
      embedInputs: jest.fn(),
    };
    const service = new KnowledgeDocsService(
      prisma as never,
      embeddingService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
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
    expect(embeddingService.embedInputs).not.toHaveBeenCalled();
    expect(documentUpdate).not.toHaveBeenCalled();
  });
});
