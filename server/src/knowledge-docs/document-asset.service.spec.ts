jest.mock('@libs/shared', () => ({
  FileStorageService: class FileStorageService {},
}));

jest.mock('@libs/model-adapters', () => ({
  ImageUnderstandingService: class ImageUnderstandingService {},
}));

jest.mock('@libs/shared/generated/prisma/enums', () => ({
  AiModelType: {
    IMAGE: 'IMAGE',
  },
  ChunkStatus: {
    ACTIVE: 'ACTIVE',
    DISABLED: 'DISABLED',
  },
}));

import { DocumentAssetService } from './document-asset.service';

describe('DocumentAssetService', () => {
  const createService = () => {
    const fileStorageService = {
      saveBuffer: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'asset-file-1',
          fileName: 'page-1.png',
          mimeType: 'image/png',
          fileSize: 64,
          sha256Hash: 'asset-hash',
        })
        .mockResolvedValueOnce({
          id: 'asset-file-2',
          fileName: 'diagram.png',
          mimeType: 'image/png',
          fileSize: 32,
          sha256Hash: 'diagram-hash',
        }),
      readBuffer: jest.fn().mockResolvedValue({
        mimeType: 'image/png',
        buffer: Buffer.from('image-bytes'),
      }),
      removeFilesIfUnreferenced: jest.fn(),
    };
    const imageUnderstandingService = {
      understandImage: jest
        .fn()
        .mockResolvedValue('图片文字：VPN 申请单。业务信息：需要主管审批。'),
    };
    const service = new DocumentAssetService(
      fileStorageService as never,
      imageUnderstandingService as never,
    );

    return { service, fileStorageService, imageUnderstandingService };
  };

  it('saves parser assets as document asset metadata', async () => {
    const { service, fileStorageService } = createService();

    const assets = await service.saveParsedAssets('doc-1', 'source-file-1', {
      fileName: '扫描件.pdf',
      documentName: '扫描件',
      sourceFormat: 'PDF',
      chunks: [],
      assets: [
        {
          source: 'PDF_PAGE_SCREENSHOT',
          fileName: 'page-1.png',
          mimeType: 'image/png',
          reference: './files/page-1.png',
          buffer: Buffer.from('page-image'),
        },
      ],
    });

    expect(fileStorageService.saveBuffer).toHaveBeenCalledWith({
      fileName: 'page-1.png',
      mimeType: 'image/png',
      buffer: Buffer.from('page-image'),
      metadata: {
        source: 'PDF_PAGE_SCREENSHOT',
        sourceFormat: 'PDF',
        documentId: 'doc-1',
        sourceFileId: 'source-file-1',
        originalReference: './files/page-1.png',
      },
    });
    expect(assets).toEqual([
      {
        source: 'PDF_PAGE_SCREENSHOT',
        fileId: 'asset-file-1',
        fileName: 'page-1.png',
        mimeType: 'image/png',
        fileSize: 64,
        sha256Hash: 'asset-hash',
        originalReference: './files/page-1.png',
        reference: './files/asset-file-1',
      },
    ]);
  });

  it('rewrites chunk content and metadata asset references', () => {
    const { service } = createService();

    const chunks = service.rewriteChunkAssetReferences(
      [
        {
          id: 'chunk-1',
          title: '扫描件',
          content: '![page](./files/page-1.png)',
          status: 'ACTIVE',
          position: 0,
          charCount: 28,
          metadata: {
            contentKind: 'PDF_PAGE_IMAGE',
            assetReference: './files/page-1.png',
            pageNumber: 1,
          },
        },
      ],
      [
        {
          source: 'PDF_PAGE_SCREENSHOT',
          fileId: 'asset-file-1',
          fileName: 'page-1.png',
          mimeType: 'image/png',
          fileSize: 64,
          sha256Hash: 'asset-hash',
          originalReference: './files/page-1.png',
          reference: './files/asset-file-1',
        },
      ],
    );

    expect(chunks).toEqual([
      expect.objectContaining({
        content: '![page](./files/asset-file-1)',
        charCount: 29,
        metadata: {
          contentKind: 'PDF_PAGE_IMAGE',
          assetReference: './files/asset-file-1',
          assetFileId: 'asset-file-1',
          assetSource: 'PDF_PAGE_SCREENSHOT',
          pageNumber: 1,
        },
      }),
    ]);
  });

  it('creates image understanding chunks from saved image assets', async () => {
    const { service, imageUnderstandingService } = createService();

    const result = await service.createImageUnderstandingChunks(
      {
        metadata: {
          imageUnderstandingPrompt: '提取图片中的文字并总结业务信息。',
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
      },
      [
        {
          source: 'PDF_PAGE_SCREENSHOT',
          fileId: 'asset-file-1',
          fileName: 'page-1.png',
          mimeType: 'image/png',
          fileSize: 64,
          sha256Hash: 'asset-hash',
          originalReference: './files/page-1.png',
          reference: './files/asset-file-1',
        },
      ],
      [
        {
          id: 'source-chunk-1',
          title: '扫描件 / 第 1 页',
          content: '![page](./files/asset-file-1)',
          status: 'ACTIVE',
          position: 0,
          charCount: 29,
          metadata: {
            contentKind: 'PDF_PAGE_IMAGE',
            assetFileId: 'asset-file-1',
            pageNumber: 1,
          },
        },
      ],
    );

    expect(imageUnderstandingService.understandImage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'vision-1', modelName: 'qwen-vl-max' }),
      {
        dataUrl: 'data:image/png;base64,aW1hZ2UtYnl0ZXM=',
        prompt: '提取图片中的文字并总结业务信息。',
      },
    );
    expect(result.warnings).toEqual([]);
    expect(result.chunks).toEqual([
      expect.objectContaining({
        title: '图片理解 / 第 1 页',
        content: '图片文字：VPN 申请单。业务信息：需要主管审批。',
        status: 'ACTIVE',
        position: 1,
        charCount: 25,
        metadata: {
          contentKind: 'IMAGE_UNDERSTANDING',
          assetFileId: 'asset-file-1',
          assetSource: 'PDF_PAGE_SCREENSHOT',
        },
      }),
    ]);
  });

  it('returns no asset work when parser result has no assets', async () => {
    const { service, fileStorageService, imageUnderstandingService } =
      createService();

    const assets = await service.saveParsedAssets('doc-1', 'source-file-1', {
      fileName: '制度.md',
      documentName: '制度',
      sourceFormat: 'MARKDOWN',
      chunks: [],
    });
    const result = await service.createImageUnderstandingChunks(
      {
        metadata: {},
        visionModel: null,
      },
      assets,
      [],
    );

    expect(assets).toEqual([]);
    expect(result).toEqual({ chunks: [], warnings: [] });
    expect(fileStorageService.saveBuffer).not.toHaveBeenCalled();
    expect(imageUnderstandingService.understandImage).not.toHaveBeenCalled();
  });
});
