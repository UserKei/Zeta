import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@libs/shared';
import { DocumentStatus } from '@libs/shared/generated/prisma/enums';
import type { Prisma } from '@libs/shared/generated/prisma/client';
import { ChunkIndexingService } from './chunk-indexing.service';
import {
  DocumentAssetService,
  type DocumentAssetMetadata,
  type ImageUnderstandingWarning,
} from './document-asset.service';
import type { ImageUnderstandingJobData } from './document-processing.constants';
import { DocumentProcessingJobService } from './document-processing-job.service';
import {
  indexableKnowledgeBaseSelect,
  withIndexableEmbeddingModel,
} from './knowledge-base-model-resolver';

@Injectable()
export class DocumentImageUnderstandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentAssetService: DocumentAssetService,
    private readonly chunkIndexingService: ChunkIndexingService,
    private readonly documentProcessingJobService: DocumentProcessingJobService,
  ) {}

  async processDocument(job: ImageUnderstandingJobData) {
    const document = await this.prisma.document.findUnique({
      where: { id: job.documentId },
      select: {
        id: true,
        knowledgeBaseId: true,
        metadata: true,
        knowledgeBase: { select: indexableKnowledgeBaseSelect },
      },
    });

    if (!document || document.knowledgeBaseId !== job.knowledgeBaseId) {
      throw new NotFoundException(
        'image understanding document does not exist',
      );
    }

    try {
      const knowledgeBase = withIndexableEmbeddingModel(document.knowledgeBase);

      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.CHUNKING, errorMessage: null },
      });

      const sourceChunks = await this.prisma.chunk.findMany({
        where: { documentId: document.id },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          title: true,
          content: true,
          status: true,
          position: true,
          charCount: true,
          metadata: true,
        },
      });
      const assets = this.getDocumentAssets(document.metadata);
      const pendingAssets = this.getPendingImageAssets(assets, sourceChunks);
      const sourceChunkDrafts = sourceChunks.map((chunk) => ({
        ...chunk,
        metadata: this.toInputMetadata(chunk.metadata),
      }));
      const warnings: ImageUnderstandingWarning[] = [];

      if (pendingAssets.length > 0) {
        const imageUnderstandingResult =
          await this.documentAssetService.createImageUnderstandingChunks(
            knowledgeBase,
            pendingAssets,
            sourceChunkDrafts,
          );

        warnings.push(...imageUnderstandingResult.warnings);

        if (imageUnderstandingResult.chunks.length > 0) {
          await this.chunkIndexingService.createChunks(
            knowledgeBase.id,
            document.id,
            imageUnderstandingResult.chunks,
          );
          await this.chunkIndexingService.refreshDocumentSearchVector(
            document.id,
          );
          await this.chunkIndexingService.refreshDocumentStats(document.id);
        }
      }

      const embeddingDocument = await this.prisma.document.update({
        where: { id: document.id },
        data: {
          status: DocumentStatus.EMBEDDING,
          errorMessage: null,
          metadata: {
            ...this.toMetadataObject(document.metadata),
            ...(warnings.length > 0
              ? { imageUnderstandingWarnings: warnings }
              : {}),
          },
        },
        select: { updatedAt: true },
      });

      await this.documentProcessingJobService.enqueueDocumentEmbedding({
        documentId: document.id,
        knowledgeBaseId: knowledgeBase.id,
        requestedAt: embeddingDocument.updatedAt.toISOString(),
      });
    } catch (cause) {
      await this.prisma.document.update({
        where: { id: document.id },
        data: {
          status: DocumentStatus.FAILED,
          errorMessage:
            cause instanceof Error
              ? cause.message
              : 'image understanding failed',
        },
      });

      throw cause;
    }
  }

  private getDocumentAssets(metadata: Prisma.JsonValue) {
    const assets = this.toMetadataObject(metadata).assets;

    if (!Array.isArray(assets)) {
      return [];
    }

    return assets.filter((asset): asset is DocumentAssetMetadata =>
      this.isDocumentAssetMetadata(asset),
    );
  }

  private getPendingImageAssets(
    assets: DocumentAssetMetadata[],
    chunks: Array<{ metadata: Prisma.JsonValue }>,
  ) {
    const understoodAssetFileIds = new Set(
      chunks
        .filter((chunk) => this.isImageUnderstandingChunk(chunk.metadata))
        .map((chunk) => this.toMetadataObject(chunk.metadata).assetFileId)
        .filter((fileId): fileId is string => typeof fileId === 'string'),
    );

    return assets.filter((asset) => !understoodAssetFileIds.has(asset.fileId));
  }

  private isImageUnderstandingChunk(metadata: Prisma.JsonValue) {
    return (
      this.toMetadataObject(metadata).contentKind === 'IMAGE_UNDERSTANDING'
    );
  }

  private isDocumentAssetMetadata(
    asset: Prisma.JsonValue,
  ): asset is DocumentAssetMetadata {
    if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
      return false;
    }

    const candidate = asset as Record<string, Prisma.JsonValue>;

    return (
      typeof candidate.source === 'string' &&
      typeof candidate.fileId === 'string' &&
      typeof candidate.fileName === 'string' &&
      (typeof candidate.mimeType === 'string' || candidate.mimeType === null) &&
      typeof candidate.fileSize === 'number' &&
      (typeof candidate.sha256Hash === 'string' ||
        candidate.sha256Hash === null) &&
      typeof candidate.originalReference === 'string' &&
      typeof candidate.reference === 'string'
    );
  }

  private toMetadataObject(metadata: Prisma.JsonValue) {
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      return metadata as Record<string, Prisma.JsonValue>;
    }

    return {};
  }

  private toInputMetadata(metadata: Prisma.JsonValue): Prisma.InputJsonValue {
    if (metadata === null) {
      return {};
    }

    return metadata;
  }
}
