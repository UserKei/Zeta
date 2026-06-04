import { BadRequestException } from '@nestjs/common';

jest.mock('@libs/shared', () => ({
  FileStorageService: class FileStorageService {},
  PrismaService: class PrismaService {},
}));

jest.mock('@libs/model-adapters', () => ({
  EmbeddingService: class EmbeddingService {},
}));

jest.mock('@libs/shared/generated/prisma/enums', () => ({
  ChunkStatus: {
    ACTIVE: 'ACTIVE',
    DISABLED: 'DISABLED',
  },
  DocumentStatus: {
    INDEXED: 'INDEXED',
  },
}));

import { ChunkIndexingService } from './chunk-indexing.service';

describe('ChunkIndexingService', () => {
  const embeddingModel = {
    id: 'embedding-1',
    modelName: 'text-embedding-v4',
    baseUrl: 'https://embedding.example.com/v1',
    apiKey: 'sk-embedding',
    configJson: {},
  };

  const createService = () => {
    const prisma = {
      chunk: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      chunkEmbedding: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      document: {
        update: jest.fn().mockResolvedValue({}),
      },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    const embeddingService = {
      embedInputs: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    };
    const fileStorageService = {
      readBuffer: jest.fn().mockResolvedValue({
        mimeType: 'image/png',
        buffer: Buffer.from('image-bytes'),
      }),
    };
    const service = new ChunkIndexingService(
      prisma as never,
      embeddingService as never,
      fileStorageService as never,
    );

    return { service, prisma, embeddingService, fileStorageService };
  };

  it('creates document chunks with knowledge base and document ids', async () => {
    const { service, prisma } = createService();

    await service.createChunks('kb-1', 'doc-1', [
      {
        id: 'chunk-1',
        title: '标题',
        content: '正文',
        status: 'ACTIVE',
        position: 0,
        charCount: 2,
        metadata: {},
      },
    ]);

    expect(prisma.chunk.createMany).toHaveBeenCalledWith({
      data: [
        {
          id: 'chunk-1',
          knowledgeBaseId: 'kb-1',
          documentId: 'doc-1',
          title: '标题',
          content: '正文',
          status: 'ACTIVE',
          position: 0,
          charCount: 2,
          metadata: {},
        },
      ],
    });
  });

  it('rebuilds embeddings for active document chunks', async () => {
    const { service, prisma, embeddingService } = createService();

    prisma.chunk.findMany.mockResolvedValue([
      {
        id: 'chunk-1',
        title: '标题',
        content: '正文',
        metadata: {
          retrievalHints: [
            'content/handbook/about/maintenance.md',
            'handbook about maintenance',
          ],
        },
        document: { name: '制度文档', metadata: {} },
      },
      {
        id: 'chunk-2',
        title: null,
        content: '补充正文',
        metadata: {},
        document: {
          name: '制度文档',
          metadata: {
            retrievalHints: ['content/handbook/about/_index.md'],
          },
        },
      },
    ]);
    embeddingService.embedInputs.mockResolvedValue([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);

    await service.rebuildDocumentEmbeddings('doc-1', embeddingModel);

    expect(prisma.chunk.findMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1', status: 'ACTIVE' },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        title: true,
        content: true,
        metadata: true,
        document: { select: { name: true, metadata: true } },
      },
    });
    expect(prisma.chunkEmbedding.deleteMany).toHaveBeenCalledWith({
      where: {
        embeddingModelId: 'embedding-1',
        chunkId: { in: ['chunk-1', 'chunk-2'] },
      },
    });
    expect(embeddingService.embedInputs).toHaveBeenCalledWith(embeddingModel, [
      {
        text: '制度文档\ncontent/handbook/about/maintenance.md\nhandbook about maintenance\n标题\n正文',
      },
      { text: '制度文档\ncontent/handbook/about/_index.md\n补充正文' },
    ]);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    expect(prisma.$executeRaw.mock.calls[0]).toEqual(
      expect.arrayContaining(['chunk-1', 'embedding-1', '[0.1,0.2]', 2]),
    );
    expect(prisma.$executeRaw.mock.calls[1]).toEqual(
      expect.arrayContaining(['chunk-2', 'embedding-1', '[0.3,0.4]', 2]),
    );
  });

  it('rejects mismatched chunk and embedding counts', async () => {
    const { service, prisma, embeddingService } = createService();

    prisma.chunk.findMany.mockResolvedValue([
      {
        id: 'chunk-1',
        title: '标题',
        content: '正文',
        metadata: {},
        document: { name: '制度文档', metadata: {} },
      },
      {
        id: 'chunk-2',
        title: null,
        content: '补充正文',
        metadata: {},
        document: { name: '制度文档', metadata: {} },
      },
    ]);
    embeddingService.embedInputs.mockResolvedValue([[0.1, 0.2]]);

    await expect(
      service.rebuildDocumentEmbeddings('doc-1', embeddingModel),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('adds image data to multimodal PDF page embedding inputs', async () => {
    const { service, prisma, embeddingService, fileStorageService } =
      createService();
    const multimodalModel = {
      ...embeddingModel,
      configJson: { protocol: 'dashscope-multimodal' },
    };

    prisma.chunk.findMany.mockResolvedValue([
      {
        id: 'chunk-1',
        title: '第 1 页',
        content: '页面图片',
        document: { name: '扫描件', metadata: {} },
        metadata: {
          contentKind: 'PDF_PAGE_IMAGE',
          assetFileId: 'asset-file-1',
        },
      },
    ]);

    await service.rebuildDocumentEmbeddings('doc-1', multimodalModel);

    expect(fileStorageService.readBuffer).toHaveBeenCalledWith('asset-file-1');
    expect(embeddingService.embedInputs).toHaveBeenCalledWith(multimodalModel, [
      {
        text: '扫描件\n第 1 页\n页面图片',
        image: {
          dataUrl: 'data:image/png;base64,aW1hZ2UtYnl0ZXM=',
        },
      },
    ]);
  });

  it('does not write embeddings for inactive chunks', async () => {
    const { service, prisma, embeddingService } = createService();

    await service.syncChunkEmbedding('chunk-1', embeddingModel, 'DISABLED');

    expect(prisma.chunkEmbedding.deleteMany).toHaveBeenCalledWith({
      where: { chunkId: 'chunk-1' },
    });
    expect(embeddingService.embedInputs).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('refreshes document stats without changing document status', async () => {
    const { service, prisma } = createService();

    prisma.chunk.findMany.mockResolvedValue([
      { charCount: 10 },
      { charCount: 15 },
    ]);

    await service.refreshDocumentStats('doc-1');

    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: {
        charCount: 25,
        chunkCount: 2,
      },
    });
  });

  it('refreshes indexed document stats and marks document indexed', async () => {
    const { service, prisma } = createService();

    prisma.chunk.findMany.mockResolvedValue([
      { charCount: 10 },
      { charCount: 15 },
    ]);

    await service.refreshIndexedDocumentStats('doc-1');

    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: {
        charCount: 25,
        chunkCount: 2,
        status: 'INDEXED',
        errorMessage: null,
      },
    });
  });

  it('normalizes document chunk positions by current order', async () => {
    const { service, prisma } = createService();

    prisma.chunk.findMany.mockResolvedValue([
      { id: 'chunk-b' },
      { id: 'chunk-a' },
    ]);

    await service.reorderDocumentChunks('doc-1');

    expect(prisma.chunk.findMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1' },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    expect(prisma.chunk.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'chunk-b' },
      data: { position: 0 },
    });
    expect(prisma.chunk.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'chunk-a' },
      data: { position: 1 },
    });
  });
});
