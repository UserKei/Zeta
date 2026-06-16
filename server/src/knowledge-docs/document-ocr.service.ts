import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FileParserService,
  FileStorageService,
  PrismaService,
} from '@libs/shared';
import { DocumentStatus } from '@libs/shared/generated/prisma/enums';
import type { Prisma } from '@libs/shared/generated/prisma/client';
import {
  assertDocumentChunks,
  countChunkChars,
  toChunkDrafts,
} from './chunk-draft-normalizer';
import { ChunkIndexingService } from './chunk-indexing.service';
import {
  MAX_CHUNK_CONTENT_LENGTH,
  MAX_CHUNK_COUNT,
} from './knowledge-docs.constants';
import {
  indexableKnowledgeBaseSelect,
  withIndexableEmbeddingModel,
} from './knowledge-base-model-resolver';
import type { OcrDocumentJobData } from './document-processing.constants';
import { DocumentProcessingJobService } from './document-processing-job.service';
import { OcrClientService } from './ocr-client.service';

@Injectable()
export class DocumentOcrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorageService: FileStorageService,
    private readonly ocrClientService: OcrClientService,
    private readonly fileParser: FileParserService,
    private readonly chunkIndexingService: ChunkIndexingService,
    private readonly documentProcessingJobService: DocumentProcessingJobService,
  ) {}

  async processDocument(job: OcrDocumentJobData) {
    const document = await this.prisma.document.findUnique({
      where: { id: job.documentId },
      select: {
        id: true,
        name: true,
        metadata: true,
        sourceFileId: true,
        knowledgeBase: { select: indexableKnowledgeBaseSelect },
      },
    });

    if (!document || document.sourceFileId !== job.sourceFileId) {
      throw new NotFoundException('OCR document does not exist');
    }

    const knowledgeBase = withIndexableEmbeddingModel(document.knowledgeBase);
    const metadata = this.toMetadataObject(document.metadata);

    try {
      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.OCR_PROCESSING, errorMessage: null },
      });

      const sourceFile = await this.fileStorageService.readBuffer(
        job.sourceFileId,
      );
      const ocrResult = await this.ocrClientService.recognizePdf({
        fileName: sourceFile.fileName,
        buffer: sourceFile.buffer,
      });
      const markdown = this.getOcrMarkdown(ocrResult);
      const maxChunkLength = Math.min(
        knowledgeBase.chunkSize,
        MAX_CHUNK_CONTENT_LENGTH,
      );
      const overlapLength = Math.min(
        knowledgeBase.chunkOverlap,
        Math.max(maxChunkLength - 1, 0),
      );
      const parsedFile = await this.fileParser.parse(
        {
          fileName: `${document.name}.ocr.md`,
          mimeType: 'text/markdown',
          buffer: Buffer.from(markdown),
        },
        {
          maxChunkLength,
          overlapLength,
          maxChunkCount: MAX_CHUNK_COUNT,
        },
      );
      const chunks = toChunkDrafts(parsedFile.chunks);

      assertDocumentChunks(chunks);

      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.CHUNKING, errorMessage: null },
      });
      await this.prisma.chunkEmbedding.deleteMany({
        where: { chunk: { documentId: document.id } },
      });
      await this.prisma.chunk.deleteMany({
        where: { documentId: document.id },
      });
      await this.chunkIndexingService.createChunks(
        knowledgeBase.id,
        document.id,
        chunks,
      );
      await this.chunkIndexingService.refreshDocumentSearchVector(document.id);

      const embeddingDocument = await this.prisma.document.update({
        where: { id: document.id },
        data: {
          status: DocumentStatus.EMBEDDING,
          charCount: countChunkChars(chunks),
          chunkCount: chunks.length,
          errorMessage: null,
          metadata: {
            ...metadata,
            ocr: { status: 'completed' },
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
            cause instanceof Error ? cause.message : 'OCR processing failed',
          metadata: {
            ...metadata,
            ocr: { status: 'failed' },
          },
        },
      });

      throw cause;
    }
  }

  private getOcrMarkdown(ocrResult: { markdown?: string; text?: string }) {
    const markdown = ocrResult.markdown?.trim() || ocrResult.text?.trim();

    if (!markdown) {
      throw new Error('OCR service did not return text');
    }

    return markdown;
  }

  private toMetadataObject(metadata: Prisma.JsonValue) {
    return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, Prisma.JsonValue>)
      : {};
  }
}
