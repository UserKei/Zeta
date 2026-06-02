import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ImageUnderstandingService } from '@libs/model-adapters';
import { FileStorageService, type FileParseResult } from '@libs/shared';
import { AiModelType, ChunkStatus } from '@libs/shared/generated/prisma/enums';
import type { Prisma } from '@libs/shared/generated/prisma/client';

const MAX_CHUNK_COUNT = 200;
const IMAGE_UNDERSTANDING_ASSET_LIMIT = 10;
const DEFAULT_IMAGE_UNDERSTANDING_PROMPT =
  '请识别图片中的文字、表格、流程和业务含义，输出一段适合知识库检索的中文描述。';

export type DocumentChunkDraft = {
  id: string;
  title: string | null;
  content: string;
  status: ChunkStatus;
  position: number;
  charCount: number;
  metadata: Prisma.InputJsonValue;
};

export type DocumentAssetMetadata = {
  source: string;
  fileId: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number;
  sha256Hash: string | null;
  originalReference: string;
  reference: string;
};

export type ImageUnderstandingWarning = {
  fileId: string;
  fileName: string;
  message: string;
};

type VisionModelConfig = {
  id: string;
  type: string;
  isEnabled: boolean;
  modelName: string;
  baseUrl: string | null;
  apiKey: string | null;
  configJson: Prisma.JsonValue;
};

export type ImageUnderstandingKnowledgeBase = {
  metadata: Prisma.JsonValue;
  visionModel: VisionModelConfig | null;
};

@Injectable()
export class DocumentAssetService {
  constructor(
    private readonly fileStorageService: FileStorageService,
    private readonly imageUnderstandingService: ImageUnderstandingService,
  ) {}

  async saveParsedAssets(
    documentId: string,
    sourceFileId: string,
    parsedFile: FileParseResult,
  ): Promise<DocumentAssetMetadata[]> {
    const assets = parsedFile.assets ?? [];

    if (assets.length === 0) {
      return [];
    }

    const savedAssets: DocumentAssetMetadata[] = [];

    try {
      for (const asset of assets) {
        const savedFile = await this.fileStorageService.saveBuffer({
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          buffer: asset.buffer,
          metadata: {
            source: asset.source,
            sourceFormat: parsedFile.sourceFormat,
            documentId,
            sourceFileId,
            originalReference: asset.reference,
          },
        });

        savedAssets.push({
          source: asset.source,
          fileId: savedFile.id,
          fileName: savedFile.fileName,
          mimeType: savedFile.mimeType,
          fileSize: Number(savedFile.fileSize),
          sha256Hash: savedFile.sha256Hash,
          originalReference: asset.reference,
          reference: `./files/${savedFile.id}`,
        });
      }
    } catch (cause) {
      await this.fileStorageService.removeFilesIfUnreferenced(
        savedAssets.map((asset) => asset.fileId),
      );
      throw cause;
    }

    return savedAssets;
  }

  rewriteChunkAssetReferences(
    chunks: DocumentChunkDraft[],
    assets: DocumentAssetMetadata[],
  ) {
    return chunks.map((chunk) => {
      const content = assets.reduce(
        (currentContent, asset) =>
          currentContent.split(asset.originalReference).join(asset.reference),
        chunk.content,
      );

      if (content === chunk.content) {
        return chunk;
      }

      return {
        ...chunk,
        content,
        charCount: content.length,
        metadata: this.rewriteChunkAssetMetadata(chunk.metadata, assets),
      };
    });
  }

  async createImageUnderstandingChunks(
    knowledgeBase: ImageUnderstandingKnowledgeBase,
    assets: DocumentAssetMetadata[],
    sourceChunks: DocumentChunkDraft[],
  ): Promise<{
    chunks: DocumentChunkDraft[];
    warnings: ImageUnderstandingWarning[];
  }> {
    const visionModel = this.getUsableVisionModel(knowledgeBase);

    if (!visionModel) {
      return { chunks: [], warnings: [] };
    }

    const remainingChunkSlots = MAX_CHUNK_COUNT - sourceChunks.length;

    if (remainingChunkSlots <= 0) {
      return { chunks: [], warnings: [] };
    }

    const prompt = this.getImageUnderstandingPrompt(knowledgeBase.metadata);
    const imageAssets = assets
      .filter((asset) => this.isImageUnderstandingAsset(asset))
      .slice(0, Math.min(IMAGE_UNDERSTANDING_ASSET_LIMIT, remainingChunkSlots));
    const chunks: DocumentChunkDraft[] = [];
    const warnings: ImageUnderstandingWarning[] = [];

    for (const asset of imageAssets) {
      try {
        const file = await this.fileStorageService.readBuffer(asset.fileId);
        const content = await this.imageUnderstandingService.understandImage(
          visionModel,
          {
            dataUrl: this.toDataUrl(
              file.mimeType || asset.mimeType || 'application/octet-stream',
              file.buffer,
            ),
            prompt,
          },
        );
        const position = sourceChunks.length + chunks.length;

        chunks.push({
          id: randomUUID(),
          title: this.getImageUnderstandingTitle(asset, sourceChunks),
          content,
          status: ChunkStatus.ACTIVE,
          position,
          charCount: content.length,
          metadata: {
            contentKind: 'IMAGE_UNDERSTANDING',
            assetFileId: asset.fileId,
            assetSource: asset.source,
          },
        });
      } catch (cause) {
        warnings.push({
          fileId: asset.fileId,
          fileName: asset.fileName,
          message:
            cause instanceof Error
              ? cause.message
              : 'image understanding failed',
        });
      }
    }

    return { chunks, warnings };
  }

  getDocumentAssetFileIds(metadata: Prisma.JsonValue) {
    const metadataObject = this.toMetadataObject(metadata);
    const assets = metadataObject.assets;

    if (!Array.isArray(assets)) {
      return [];
    }

    return assets
      .map((asset) => {
        if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
          return null;
        }

        const fileId = (asset as Record<string, Prisma.JsonValue>).fileId;

        return typeof fileId === 'string' ? fileId : null;
      })
      .filter((fileId): fileId is string => Boolean(fileId));
  }

  private rewriteChunkAssetMetadata(
    metadata: Prisma.InputJsonValue,
    assets: DocumentAssetMetadata[],
  ): Prisma.InputJsonValue {
    const metadataObject = this.toMetadataObject(metadata as Prisma.JsonValue);
    const assetReference = metadataObject.assetReference;

    if (typeof assetReference !== 'string') {
      return metadata;
    }

    const asset = assets.find(
      (candidate) => candidate.originalReference === assetReference,
    );

    if (!asset) {
      return metadata;
    }

    return {
      ...metadataObject,
      assetReference: asset.reference,
      assetFileId: asset.fileId,
      assetSource: asset.source,
    };
  }

  private getUsableVisionModel(knowledgeBase: ImageUnderstandingKnowledgeBase) {
    const visionModel = knowledgeBase.visionModel;

    if (
      !visionModel ||
      visionModel.type !== AiModelType.IMAGE ||
      !visionModel.isEnabled
    ) {
      return null;
    }

    return visionModel;
  }

  private getImageUnderstandingPrompt(metadata: Prisma.JsonValue) {
    const metadataObject = this.toMetadataObject(metadata);
    const prompt = metadataObject.imageUnderstandingPrompt;

    return typeof prompt === 'string' && prompt.trim()
      ? prompt.trim()
      : DEFAULT_IMAGE_UNDERSTANDING_PROMPT;
  }

  private isImageUnderstandingAsset(asset: DocumentAssetMetadata) {
    return (
      asset.source === 'DOCX_IMAGE' || asset.source === 'PDF_PAGE_SCREENSHOT'
    );
  }

  private getImageUnderstandingTitle(
    asset: DocumentAssetMetadata,
    chunks: DocumentChunkDraft[],
  ) {
    if (asset.source === 'PDF_PAGE_SCREENSHOT') {
      const pageNumber = this.findAssetPageNumber(asset.fileId, chunks);

      if (pageNumber !== null) {
        return `图片理解 / 第 ${pageNumber} 页`;
      }
    }

    return `图片理解 / ${asset.fileName}`;
  }

  private findAssetPageNumber(fileId: string, chunks: DocumentChunkDraft[]) {
    for (const chunk of chunks) {
      const metadata = this.toMetadataObject(
        chunk.metadata as Prisma.JsonValue,
      );

      if (
        metadata.assetFileId === fileId &&
        typeof metadata.pageNumber === 'number'
      ) {
        return metadata.pageNumber;
      }
    }

    return null;
  }

  private toMetadataObject(metadata: Prisma.JsonValue) {
    return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, Prisma.JsonValue>)
      : {};
  }

  private toDataUrl(mimeType: string, buffer: Buffer) {
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  }
}
