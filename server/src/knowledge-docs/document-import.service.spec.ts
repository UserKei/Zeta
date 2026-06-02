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

  it('creates image understanding chunks for saved PDF page images', async () => {
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
        update: jest
          .fn<Promise<unknown>, [DocumentUpdateInput]>()
          .mockResolvedValue({
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
    const documentAssetService = new DocumentAssetService(
      fileStorageService as never,
      imageUnderstandingService as never,
    );
    const chunkIndexingService = new ChunkIndexingService(
      prisma as never,
      embeddingService as never,
      fileStorageService as never,
    );
    const service = new DocumentImportService(
      prisma as never,
      fileStorageService as never,
      fileParser as never,
      documentAssetService,
      chunkIndexingService,
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
    const documentUpdateInputs = prisma.document.update.mock.calls.map(
      ([input]) => input,
    );

    expect(documentCreateInput?.data.status).toBe('CHUNKING');
    expect(documentCreateInput?.data.sourceType).toBe('FILE_UPLOAD');
    expect(documentCreateInput?.data.name).toBe('扫描件');
    expect(
      documentUpdateInputs.some(
        (input) =>
          input.where.id === 'doc-1' &&
          input.data.status === 'EMBEDDING' &&
          input.data.errorMessage === null,
      ),
    ).toBe(true);
    expect(documentUpdateInputs.at(-1)).toEqual(
      expect.objectContaining({
        where: { id: 'doc-1' },
        data: { status: 'INDEXED', errorMessage: null },
      }),
    );
    expect(fileStorageService.readBuffer).toHaveBeenCalledWith('asset-file-1');
    expect(imageUnderstandingService.understandImage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'vision-1', modelName: 'qwen-vl-max' }),
      {
        dataUrl: 'data:image/png;base64,aW1hZ2UtYnl0ZXM=',
        prompt: '提取图片中的文字并总结业务信息。',
      },
    );
    const originalPageChunk = createdChunks.find(
      (chunk) => chunk.title === '扫描件 / 第 1 页',
    );
    const imageUnderstandingChunk = createdChunks.find(
      (chunk) => chunk.title === '图片理解 / 第 1 页',
    );

    expect(originalPageChunk).toEqual(
      expect.objectContaining({
        title: '扫描件 / 第 1 页',
        content: '![扫描件 第 1 页](./files/asset-file-1)',
        position: 0,
        status: 'ACTIVE',
        charCount: '![扫描件 第 1 页](./files/asset-file-1)'.length,
      }),
    );
    expect(originalPageChunk?.metadata).toEqual(
      expect.objectContaining({
        contentKind: 'PDF_PAGE_IMAGE',
        assetReference: './files/asset-file-1',
        assetFileId: 'asset-file-1',
        assetSource: 'PDF_PAGE_SCREENSHOT',
        pageNumber: 1,
      }),
    );
    expect(imageUnderstandingChunk).toEqual(
      expect.objectContaining({
        title: '图片理解 / 第 1 页',
        content: '图片文字：VPN 申请单。业务信息：需要主管审批。',
        position: 1,
        status: 'ACTIVE',
        charCount: '图片文字：VPN 申请单。业务信息：需要主管审批。'.length,
        metadata: {
          contentKind: 'IMAGE_UNDERSTANDING',
          assetFileId: 'asset-file-1',
          assetSource: 'PDF_PAGE_SCREENSHOT',
        },
      }),
    );
    expect(embeddingService.embedInputs).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'embedding-1' }),
      [
        {
          text: '扫描件 / 第 1 页\n![扫描件 第 1 页](./files/asset-file-1)',
        },
        {
          text: '图片理解 / 第 1 页\n图片文字：VPN 申请单。业务信息：需要主管审批。',
        },
      ],
    );
    expect(result.documents).toEqual([
      expect.objectContaining({
        id: 'doc-1',
        name: '扫描件',
        status: 'INDEXED',
      }),
    ]);
  });
});
