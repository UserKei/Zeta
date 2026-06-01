import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  EmbeddingService,
  FileParserService,
  FileStorageService,
  ImageUnderstandingService,
  PrismaService,
  RetrievalService,
  type EmbeddingInput,
  type FileParseResult,
} from '@libs/shared';
import {
  AiModelType,
  ChunkStatus,
  DocumentSourceType,
  DocumentStatus,
  KnowledgeBaseStatus,
} from '@libs/shared/generated/prisma/enums';
import type { Prisma } from '@libs/shared/generated/prisma/client';
import type {
  ChunkReorderPayload,
  ChunkDraftPayload,
  ChunkPayload,
  ChunkUpdatePayload,
  DocumentUpdatePayload,
  FileImportDocumentPayload,
  FilePreviewResult,
  MarkdownImportPayload,
  ManualDocumentPayload,
  RetrievalTestPayload,
} from '@zeta/common/knowledge-docs';
import { chunkSelect, documentSelect } from './knowledge-docs.select';

type DocumentRecord = Prisma.DocumentGetPayload<{
  select: typeof documentSelect;
}>;

type ChunkDraft = {
  id: string;
  title: string | null;
  content: string;
  status: ChunkStatus;
  position: number;
  charCount: number;
  metadata: Prisma.InputJsonValue;
};

type EmbeddableChunk = {
  id: string;
  title: string | null;
  content: string;
  metadata: Prisma.JsonValue;
};

type DocumentAssetMetadata = {
  source: string;
  fileId: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number;
  sha256Hash: string | null;
  originalReference: string;
  reference: string;
};

type ImageUnderstandingWarning = {
  fileId: string;
  fileName: string;
  message: string;
};

export type UploadedDocumentFile = {
  originalname: string;
  mimetype?: string;
  size: number;
  buffer: Buffer;
};

type MarkdownImportFields = {
  name?: string;
  description?: string;
  chunks?: string | ChunkDraftPayload[];
};

type FileImportFields = {
  documents?: string | FileImportDocumentPayload[];
};

type AiExtractedChunkInput = {
  documentId?: string;
  documentName?: string;
  title?: string | null;
  content: string;
  sourceMessageId: string;
};

const MAX_DOCUMENT_CONTENT_LENGTH = 200_000;
const MAX_CHUNK_CONTENT_LENGTH = 102_400;
const MAX_CHUNK_COUNT = 200;
const LATIN1_MOJIBAKE_PATTERN = /[\u0080-\u009f]/;
export const DOCUMENT_FILE_SIZE_LIMIT = 2 * 1024 * 1024;
export const DOCUMENT_FILE_COUNT_LIMIT = 10;
export const MARKDOWN_FILE_SIZE_LIMIT = DOCUMENT_FILE_SIZE_LIMIT;
const IMAGE_UNDERSTANDING_ASSET_LIMIT = 10;
const DEFAULT_IMAGE_UNDERSTANDING_PROMPT =
  '请先提取图片中的可读文字；如果图片不是纯文字内容，请用中文总结图片表达的业务信息，突出对知识检索有价值的事实。';

@Injectable()
export class KnowledgeDocsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly fileStorageService: FileStorageService,
    private readonly fileParser: FileParserService,
    private readonly retrievalService: RetrievalService,
    private readonly imageUnderstandingService: ImageUnderstandingService,
  ) {}

  async listByKnowledgeBase(knowledgeBaseId: string) {
    await this.requireKnowledgeBase(knowledgeBaseId);

    const documents = await this.prisma.document.findMany({
      where: { knowledgeBaseId },
      orderBy: { updatedAt: 'desc' },
      select: documentSelect,
    });

    return documents.map((document) => this.toDocumentResponse(document));
  }

  async getDocument(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: documentSelect,
    });

    if (!document) {
      throw new NotFoundException('document does not exist');
    }

    return this.toDocumentResponse(document);
  }

  async updateDocument(id: string, input: DocumentUpdatePayload) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: documentSelect,
    });

    if (!document) {
      throw new NotFoundException('document does not exist');
    }

    const data: Prisma.DocumentUpdateInput = {};

    if (input.name !== undefined) {
      const name = input.name.trim();

      if (!name) {
        throw new BadRequestException('name is required');
      }

      data.name = name;
    }

    if (input.description !== undefined) {
      data.metadata = {
        ...this.toMetadataObject(document.metadata),
        description: input.description?.trim() || null,
      };
    }

    if (Object.keys(data).length === 0) {
      return this.toDocumentResponse(document);
    }

    const updated = await this.prisma.document.update({
      where: { id },
      data,
      select: documentSelect,
    });

    return this.toDocumentResponse(updated);
  }

  async createManual(knowledgeBaseId: string, input: ManualDocumentPayload) {
    const knowledgeBase =
      await this.requireIndexableKnowledgeBase(knowledgeBaseId);
    const name = input.name?.trim();
    const chunks = this.toChunkDrafts(input.chunks);

    if (!name) {
      throw new BadRequestException('name is required');
    }

    if (chunks.length > 0) {
      this.assertDocumentChunks(chunks);
    }

    const document = await this.prisma.document.create({
      data: {
        knowledgeBase: { connect: { id: knowledgeBase.id } },
        name,
        sourceType: DocumentSourceType.MANUAL,
        status:
          chunks.length === 0
            ? DocumentStatus.INDEXED
            : DocumentStatus.CHUNKING,
        charCount: this.countChars(chunks),
        chunkCount: chunks.length,
        metadata: {
          description: input.description?.trim() || null,
        },
      },
      select: documentSelect,
    });

    if (chunks.length === 0) {
      return this.toDocumentResponse(document);
    }

    try {
      await this.createChunks(knowledgeBase.id, document.id, chunks);
      await this.refreshDocumentSearchVector(document.id);

      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.EMBEDDING, errorMessage: null },
      });

      await this.rebuildDocumentEmbeddings(
        document.id,
        knowledgeBase.embeddingModel,
      );

      const indexedDocument = await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.INDEXED, errorMessage: null },
        select: documentSelect,
      });

      return this.toDocumentResponse(indexedDocument);
    } catch (cause) {
      await this.prisma.document.update({
        where: { id: document.id },
        data: {
          status: DocumentStatus.FAILED,
          errorMessage:
            cause instanceof Error ? cause.message : 'document indexing failed',
        },
      });

      throw cause;
    }
  }

  async previewMarkdownFile(
    knowledgeBaseId: string,
    file: UploadedDocumentFile | undefined,
  ) {
    await this.requireKnowledgeBase(knowledgeBaseId);

    const parsedFile = await this.parseUploadedFile(file);

    if (parsedFile.sourceFormat !== 'MARKDOWN') {
      throw new BadRequestException('仅支持 .md 或 .markdown 文件');
    }

    return {
      fileName: parsedFile.fileName,
      documentName: parsedFile.documentName,
      chunks: parsedFile.chunks,
    };
  }

  async previewDocumentFiles(
    knowledgeBaseId: string,
    files: UploadedDocumentFile[] | undefined,
  ): Promise<FilePreviewResult> {
    await this.requireKnowledgeBase(knowledgeBaseId);

    const uploadedFiles = this.assertUploadedFiles(files);

    return {
      files: await Promise.all(
        uploadedFiles.map(async (file, fileIndex) => {
          const parsedFile = await this.parseUploadedFile(file);

          return {
            fileIndex,
            fileName: parsedFile.fileName,
            documentName: parsedFile.documentName,
            sourceFormat: parsedFile.sourceFormat,
            chunks: parsedFile.chunks,
          };
        }),
      ),
    };
  }

  async createMarkdownDocument(
    knowledgeBaseId: string,
    file: UploadedDocumentFile | undefined,
    fields: MarkdownImportFields,
  ) {
    const parsedFile = await this.parseUploadedFile(file);

    if (parsedFile.sourceFormat !== 'MARKDOWN') {
      throw new BadRequestException('仅支持 .md 或 .markdown 文件');
    }

    const importPayload = this.parseMarkdownImportPayload(fields);

    const result = await this.createFileDocuments(knowledgeBaseId, [file!], {
      documents: [
        {
          fileIndex: 0,
          name: importPayload.name?.trim() || parsedFile.documentName,
          description: importPayload.description,
          chunks: importPayload.chunks,
        },
      ],
    });

    return result.documents[0];
  }

  async createFileDocuments(
    knowledgeBaseId: string,
    files: UploadedDocumentFile[] | undefined,
    fields: FileImportFields,
  ) {
    const knowledgeBase =
      await this.requireIndexableKnowledgeBase(knowledgeBaseId);
    const uploadedFiles = this.assertUploadedFiles(files);
    const importDocuments = this.parseFileImportPayload(fields, uploadedFiles);
    const documents: Array<ReturnType<typeof this.toDocumentResponse>> = [];

    for (const importDocument of importDocuments) {
      const file = uploadedFiles[importDocument.fileIndex];
      const parsedFile = await this.parseUploadedFile(file);
      const chunks = this.toChunkDrafts(importDocument.chunks);
      const name = importDocument.name?.trim() || parsedFile.documentName;

      if (!name) {
        throw new BadRequestException('name is required');
      }

      this.assertDocumentChunks(chunks);

      const document = await this.createUploadedFileDocument(
        knowledgeBase,
        file,
        parsedFile,
        {
          name,
          description: importDocument.description,
          chunks,
        },
      );

      documents.push(document);
    }

    return { documents };
  }

  private async createUploadedFileDocument(
    knowledgeBase: IndexableKnowledgeBaseWithEmbedding,
    file: UploadedDocumentFile,
    parsedFile: FileParseResult,
    input: {
      name: string;
      description?: string;
      chunks: ChunkDraft[];
    },
  ) {
    const originalCharCount = this.countChars(input.chunks);

    const sourceFile = await this.fileStorageService.saveBuffer({
      fileName: parsedFile.fileName,
      mimeType: file.mimetype || null,
      buffer: file.buffer,
      metadata: {
        sourceFormat: parsedFile.sourceFormat,
      },
    });
    let document: DocumentRecord | null = null;
    let chunks = input.chunks;

    try {
      const documentMetadata = {
        description: input.description?.trim() || null,
        sourceFormat: parsedFile.sourceFormat,
        originalFileName: sourceFile.fileName,
        originalFileSize: Number(sourceFile.fileSize),
        sha256Hash: sourceFile.sha256Hash,
        originalCharCount,
      };

      document = await this.prisma.document.create({
        data: {
          knowledgeBase: { connect: { id: knowledgeBase.id } },
          sourceFile: { connect: { id: sourceFile.id } },
          name: input.name,
          sourceType: DocumentSourceType.FILE_UPLOAD,
          status: DocumentStatus.CHUNKING,
          charCount: this.countChars(chunks),
          chunkCount: chunks.length,
          metadata: documentMetadata,
        },
        select: documentSelect,
      });

      const assets = await this.saveParsedFileAssets(
        document.id,
        sourceFile.id,
        parsedFile,
      );
      const imageUnderstandingWarnings: ImageUnderstandingWarning[] = [];

      if (assets.length > 0) {
        chunks = this.rewriteAssetReferences(chunks, assets);
      }

      if (assets.length > 0) {
        const imageUnderstandingResult =
          await this.createImageUnderstandingChunks(
            knowledgeBase,
            assets,
            chunks,
          );

        chunks = [...chunks, ...imageUnderstandingResult.chunks];
        imageUnderstandingWarnings.push(...imageUnderstandingResult.warnings);
      }

      if (assets.length > 0 || imageUnderstandingWarnings.length > 0) {
        this.assertDocumentChunks(chunks);

        await this.prisma.document.update({
          where: { id: document.id },
          data: {
            charCount: this.countChars(chunks),
            chunkCount: chunks.length,
            metadata: {
              ...documentMetadata,
              ...(assets.length > 0 ? { assets } : {}),
              ...(imageUnderstandingWarnings.length > 0
                ? { imageUnderstandingWarnings }
                : {}),
            },
          },
        });
      }

      await this.createChunks(knowledgeBase.id, document.id, chunks);
      await this.refreshDocumentSearchVector(document.id);

      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.EMBEDDING, errorMessage: null },
      });

      await this.rebuildDocumentEmbeddings(
        document.id,
        knowledgeBase.embeddingModel,
      );

      const indexedDocument = await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.INDEXED, errorMessage: null },
        select: documentSelect,
      });

      return this.toDocumentResponse(indexedDocument);
    } catch (cause) {
      if (document) {
        await this.prisma.document.update({
          where: { id: document.id },
          data: {
            status: DocumentStatus.FAILED,
            errorMessage:
              cause instanceof Error
                ? cause.message
                : 'document indexing failed',
          },
        });
      } else {
        await this.fileStorageService.removeFileIfUnreferenced(sourceFile.id);
      }

      throw cause;
    }
  }

  async createAiExtractedChunk(
    knowledgeBaseId: string,
    input: AiExtractedChunkInput,
  ) {
    const knowledgeBase =
      await this.requireIndexableKnowledgeBase(knowledgeBaseId);
    const document = input.documentId
      ? await this.requireAiExtractedTargetDocument(
          knowledgeBase.id,
          input.documentId,
        )
      : await this.findOrCreateAiExtractedDocument(
          knowledgeBase.id,
          input.documentName,
          input.sourceMessageId,
        );

    const chunk = await this.createChunk(document.id, {
      title: input.title,
      content: input.content,
      status: ChunkStatus.ACTIVE,
    });
    const updatedDocument = await this.prisma.document.findUniqueOrThrow({
      where: { id: document.id },
      select: documentSelect,
    });

    return {
      document: this.toDocumentResponse(updatedDocument),
      chunk,
    };
  }

  async listChunks(documentId: string) {
    await this.requireDocument(documentId);

    return this.prisma.chunk.findMany({
      where: { documentId },
      orderBy: { position: 'asc' },
      select: chunkSelect,
    });
  }

  async createChunk(documentId: string, input: ChunkPayload) {
    const document = await this.requireIndexableDocument(documentId);
    const chunk = this.toSingleChunkDraft(input, 0);
    const activeChunkCount = await this.countActiveChunks(document.id);

    if (chunk.status === ChunkStatus.DISABLED && activeChunkCount === 0) {
      throw new BadRequestException('document must have active chunks');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      let position = await tx.chunk.count({ where: { documentId } });

      if (input.afterChunkId) {
        const previousChunk = await tx.chunk.findFirst({
          where: { id: input.afterChunkId, documentId },
          select: { position: true },
        });

        if (!previousChunk) {
          throw new NotFoundException('after chunk does not exist');
        }

        position = previousChunk.position + 1;

        const movingChunks = await tx.chunk.findMany({
          where: { documentId, position: { gte: position } },
          orderBy: { position: 'desc' },
          select: { id: true, position: true },
        });

        for (const movingChunk of movingChunks) {
          await tx.chunk.update({
            where: { id: movingChunk.id },
            data: { position: movingChunk.position + 1 },
          });
        }
      }

      return tx.chunk.create({
        data: {
          id: randomUUID(),
          knowledgeBaseId: document.knowledgeBaseId,
          documentId,
          title: chunk.title,
          content: chunk.content,
          position,
          charCount: chunk.charCount,
          status: chunk.status,
          metadata: chunk.metadata,
        },
        select: chunkSelect,
      });
    });

    await this.refreshChunkSearchVector(created.id);

    if (created.status === ChunkStatus.ACTIVE) {
      await this.rebuildChunkEmbedding(
        created.id,
        document.knowledgeBase.embeddingModel,
      );
    }

    await this.refreshDocumentStats(documentId);

    return this.prisma.chunk.findUniqueOrThrow({
      where: { id: created.id },
      select: chunkSelect,
    });
  }

  async updateChunk(id: string, input: ChunkUpdatePayload) {
    const chunk = await this.requireIndexableChunk(id);
    const nextContent =
      input.content === undefined
        ? chunk.content
        : this.normalizeText(input.content);
    const nextStatus = this.normalizeChunkStatus(input.status, chunk.status);

    if (!nextContent) {
      throw new BadRequestException('chunk content is required');
    }

    if (nextContent.length > MAX_CHUNK_CONTENT_LENGTH) {
      throw new BadRequestException(
        `chunk content cannot exceed ${MAX_CHUNK_CONTENT_LENGTH} characters`,
      );
    }

    if (nextStatus === ChunkStatus.DISABLED) {
      await this.assertCanDeactivateChunk(chunk.id, chunk.documentId);
    }

    const updated = await this.prisma.chunk.update({
      where: { id },
      data: {
        title:
          input.title === undefined
            ? chunk.title
            : this.normalizeTitle(input.title),
        content: nextContent,
        charCount: nextContent.length,
        status: nextStatus,
      },
      select: chunkSelect,
    });

    await this.refreshChunkSearchVector(updated.id);

    if (updated.status === ChunkStatus.ACTIVE) {
      await this.rebuildChunkEmbedding(
        updated.id,
        chunk.document.knowledgeBase.embeddingModel,
      );
    } else {
      await this.prisma.chunkEmbedding.deleteMany({ where: { chunkId: id } });
    }

    await this.refreshDocumentStats(updated.documentId);

    return updated;
  }

  async removeChunk(id: string) {
    const chunk = await this.requireIndexableChunk(id);

    if (chunk.status === ChunkStatus.ACTIVE) {
      await this.assertCanDeactivateChunk(chunk.id, chunk.documentId);
    }

    await this.prisma.chatCitation.deleteMany({ where: { chunkId: id } });
    await this.prisma.chunkEmbedding.deleteMany({ where: { chunkId: id } });
    await this.prisma.chunk.delete({ where: { id } });
    await this.reorderDocumentChunks(chunk.documentId);
    await this.refreshDocumentStats(chunk.documentId);

    return { id };
  }

  async removeImprovedChunk(id: string) {
    const chunk = await this.prisma.chunk.findUnique({
      where: { id },
      select: {
        id: true,
        documentId: true,
      },
    });

    if (!chunk) {
      throw new NotFoundException('chunk does not exist');
    }

    await this.prisma.chatCitation.deleteMany({ where: { chunkId: id } });
    await this.prisma.chunkEmbedding.deleteMany({ where: { chunkId: id } });
    await this.prisma.chunk.delete({ where: { id } });
    await this.reorderDocumentChunks(chunk.documentId);
    await this.refreshDocumentStats(chunk.documentId);

    return { id };
  }

  async reorderChunks(documentId: string, input: ChunkReorderPayload) {
    await this.requireDocument(documentId);

    if (!Array.isArray(input.chunkIds)) {
      throw new BadRequestException('chunkIds are required');
    }

    const chunks = await this.prisma.chunk.findMany({
      where: { documentId },
      select: { id: true },
    });
    const existingChunkIds = new Set(chunks.map((chunk) => chunk.id));
    const nextChunkIds = new Set(input.chunkIds);

    if (
      chunks.length !== input.chunkIds.length ||
      existingChunkIds.size !== nextChunkIds.size ||
      input.chunkIds.some((chunkId) => !existingChunkIds.has(chunkId))
    ) {
      throw new BadRequestException(
        'chunkIds must include all document chunks',
      );
    }

    const temporaryPositionOffset = 100_000;

    await this.prisma.$transaction(async (tx) => {
      for (const [position, chunkId] of input.chunkIds.entries()) {
        await tx.chunk.update({
          where: { id: chunkId },
          data: { position: position + temporaryPositionOffset },
        });
      }

      for (const [position, chunkId] of input.chunkIds.entries()) {
        await tx.chunk.update({
          where: { id: chunkId },
          data: { position },
        });
      }
    });

    return this.listChunks(documentId);
  }

  async remove(documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, sourceFileId: true, metadata: true },
    });

    if (!document) {
      throw new NotFoundException('document does not exist');
    }

    const chunks = await this.prisma.chunk.findMany({
      where: { documentId },
      select: { id: true },
    });
    const chunkIds = chunks.map((chunk) => chunk.id);

    if (chunkIds.length > 0) {
      await this.prisma.chatCitation.deleteMany({
        where: {
          OR: [{ documentId }, { chunkId: { in: chunkIds } }],
        },
      });
      await this.prisma.chunkEmbedding.deleteMany({
        where: { chunkId: { in: chunkIds } },
      });
      await this.prisma.chunk.deleteMany({ where: { id: { in: chunkIds } } });
    }

    await this.prisma.document.delete({ where: { id: documentId } });
    await this.fileStorageService.removeFilesIfUnreferenced(
      [
        document.sourceFileId,
        ...this.getDocumentAssetFileIds(document.metadata),
      ].filter((fileId): fileId is string => Boolean(fileId)),
    );

    return { id: documentId };
  }

  private async saveParsedFileAssets(
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

  private async createImageUnderstandingChunks(
    knowledgeBase: IndexableKnowledgeBaseWithEmbedding,
    assets: DocumentAssetMetadata[],
    sourceChunks: ChunkDraft[],
  ): Promise<{
    chunks: ChunkDraft[];
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
    const chunks: ChunkDraft[] = [];
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

  private getUsableVisionModel(knowledgeBase: IndexableKnowledgeBase) {
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
    chunks: ChunkDraft[],
  ) {
    if (asset.source === 'PDF_PAGE_SCREENSHOT') {
      const pageNumber = this.findAssetPageNumber(asset.fileId, chunks);

      if (pageNumber !== null) {
        return `图片理解 / 第 ${pageNumber} 页`;
      }
    }

    return `图片理解 / ${asset.fileName}`;
  }

  private findAssetPageNumber(fileId: string, chunks: ChunkDraft[]) {
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

  private rewriteAssetReferences(
    chunks: ChunkDraft[],
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

  async retrievalTest(knowledgeBaseId: string, input: RetrievalTestPayload) {
    return this.retrievalService.retrieveFromKnowledgeBase(
      knowledgeBaseId,
      input.question,
      input.topK,
    );
  }

  private async createChunks(
    knowledgeBaseId: string,
    documentId: string,
    chunks: ChunkDraft[],
  ) {
    await this.prisma.chunk.createMany({
      data: chunks.map((chunk) => ({
        id: chunk.id,
        knowledgeBaseId,
        documentId,
        title: chunk.title,
        content: chunk.content,
        position: chunk.position,
        charCount: chunk.charCount,
        status: chunk.status,
        metadata: chunk.metadata,
      })),
    });
  }

  private async rebuildDocumentEmbeddings(
    documentId: string,
    embeddingModel: EmbeddingModelConfig,
  ) {
    const activeChunks = await this.prisma.chunk.findMany({
      where: { documentId, status: ChunkStatus.ACTIVE },
      orderBy: { position: 'asc' },
      select: { id: true, title: true, content: true, metadata: true },
    });

    if (activeChunks.length === 0) {
      throw new BadRequestException('document must have active chunks');
    }

    const chunkIds = activeChunks.map((chunk) => chunk.id);

    await this.prisma.chunkEmbedding.deleteMany({
      where: {
        embeddingModelId: embeddingModel.id,
        chunkId: { in: chunkIds },
      },
    });

    await this.createEmbeddings(
      embeddingModel.id,
      activeChunks,
      await this.embeddingService.embedInputs(
        embeddingModel,
        await this.toEmbeddingInputs(activeChunks, embeddingModel),
      ),
    );
  }

  private async rebuildChunkEmbedding(
    chunkId: string,
    embeddingModel: EmbeddingModelConfig,
  ) {
    const chunk = await this.prisma.chunk.findUniqueOrThrow({
      where: { id: chunkId },
      select: { id: true, title: true, content: true, metadata: true },
    });

    await this.prisma.chunkEmbedding.deleteMany({
      where: { chunkId, embeddingModelId: embeddingModel.id },
    });

    await this.createEmbeddings(
      embeddingModel.id,
      [chunk],
      await this.embeddingService.embedInputs(
        embeddingModel,
        await this.toEmbeddingInputs([chunk], embeddingModel),
      ),
    );
  }

  private async createEmbeddings(
    embeddingModelId: string,
    chunks: EmbeddableChunk[],
    embeddings: number[][],
  ) {
    if (chunks.length !== embeddings.length) {
      throw new BadRequestException('chunk and embedding counts do not match');
    }

    for (const [index, chunk] of chunks.entries()) {
      const embedding = embeddings[index];

      await this.prisma.$executeRaw`
        INSERT INTO "chunk_embeddings"
          ("id", "chunk_id", "embedding_model_id", "embedding", "dimension")
        VALUES
          (${randomUUID()}::uuid, ${chunk.id}::uuid, ${embeddingModelId}::uuid,
           ${this.toVectorLiteral(embedding)}::vector, ${embedding.length})
      `;
    }
  }

  private async refreshDocumentSearchVector(documentId: string) {
    await this.prisma.$executeRaw`
      UPDATE "chunks"
      SET "search_vector" = to_tsvector('simple', COALESCE("title", '') || ' ' || "content")
      WHERE "document_id" = ${documentId}::uuid
    `;
  }

  private async refreshChunkSearchVector(chunkId: string) {
    await this.prisma.$executeRaw`
      UPDATE "chunks"
      SET "search_vector" = to_tsvector('simple', COALESCE("title", '') || ' ' || "content")
      WHERE "id" = ${chunkId}::uuid
    `;
  }

  private async refreshDocumentStats(documentId: string) {
    const chunks = await this.prisma.chunk.findMany({
      where: { documentId },
      select: { charCount: true },
    });

    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        charCount: chunks.reduce((total, chunk) => total + chunk.charCount, 0),
        chunkCount: chunks.length,
        status: DocumentStatus.INDEXED,
        errorMessage: null,
      },
    });
  }

  private async reorderDocumentChunks(documentId: string) {
    const chunks = await this.prisma.chunk.findMany({
      where: { documentId },
      orderBy: { position: 'asc' },
      select: { id: true },
    });

    for (const [position, chunk] of chunks.entries()) {
      await this.prisma.chunk.update({
        where: { id: chunk.id },
        data: { position },
      });
    }
  }

  private toChunkDrafts(chunks: ChunkDraftPayload[] | undefined) {
    if (!Array.isArray(chunks)) {
      throw new BadRequestException('chunks are required');
    }

    return chunks.map((chunk, index) => this.toSingleChunkDraft(chunk, index));
  }

  private toSingleChunkDraft(input: ChunkDraftPayload, position: number) {
    const content = this.normalizeText(input.content);

    if (!content) {
      throw new BadRequestException('chunk content is required');
    }

    if (content.length > MAX_CHUNK_CONTENT_LENGTH) {
      throw new BadRequestException(
        `chunk content cannot exceed ${MAX_CHUNK_CONTENT_LENGTH} characters`,
      );
    }

    return {
      id: randomUUID(),
      title: this.normalizeTitle(input.title),
      content,
      status: this.normalizeChunkStatus(input.status, ChunkStatus.ACTIVE),
      position,
      charCount: content.length,
      metadata: this.normalizeChunkMetadata(input.metadata),
    };
  }

  private assertDocumentChunks(chunks: ChunkDraft[]) {
    if (chunks.length === 0) {
      throw new BadRequestException('at least one chunk is required');
    }

    if (chunks.length > MAX_CHUNK_COUNT) {
      throw new BadRequestException(
        `chunk count cannot exceed ${MAX_CHUNK_COUNT}`,
      );
    }

    if (!chunks.some((chunk) => chunk.status === ChunkStatus.ACTIVE)) {
      throw new BadRequestException('document must have active chunks');
    }

    if (this.countChars(chunks) > MAX_DOCUMENT_CONTENT_LENGTH) {
      throw new BadRequestException(
        `document content cannot exceed ${MAX_DOCUMENT_CONTENT_LENGTH} characters`,
      );
    }
  }

  private countChars(chunks: Array<{ charCount: number }>) {
    return chunks.reduce((total, chunk) => total + chunk.charCount, 0);
  }

  private toDocumentResponse(document: DocumentRecord) {
    const { metadata, ...documentData } = document;
    const metadataObject = this.toMetadataObject(metadata);

    return {
      ...documentData,
      description:
        typeof metadataObject.description === 'string'
          ? metadataObject.description
          : null,
    };
  }

  private toMetadataObject(metadata: Prisma.JsonValue) {
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      return metadata as Record<string, Prisma.JsonValue>;
    }

    return {};
  }

  private getDocumentAssetFileIds(metadata: Prisma.JsonValue) {
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

  private async parseUploadedFile(file: UploadedDocumentFile | undefined) {
    this.assertUploadedFile(file);

    const parsedFile = await this.fileParser.parse(
      {
        fileName: this.getUploadFileName(file),
        mimeType: file.mimetype,
        buffer: file.buffer,
      },
      {
        maxChunkLength: MAX_CHUNK_CONTENT_LENGTH,
        maxChunkCount: MAX_CHUNK_COUNT,
      },
    );

    const charCount = parsedFile.chunks.reduce(
      (total, chunk) => total + chunk.content.length,
      0,
    );

    if (charCount > MAX_DOCUMENT_CONTENT_LENGTH) {
      throw new BadRequestException(
        `document content cannot exceed ${MAX_DOCUMENT_CONTENT_LENGTH} characters`,
      );
    }

    return parsedFile;
  }

  private assertUploadedFiles(files: UploadedDocumentFile[] | undefined) {
    if (!files || files.length === 0) {
      throw new BadRequestException('请上传文档文件');
    }

    if (files.length > DOCUMENT_FILE_COUNT_LIMIT) {
      throw new BadRequestException(
        `一次最多上传 ${DOCUMENT_FILE_COUNT_LIMIT} 个文件`,
      );
    }

    for (const file of files) {
      this.assertUploadedFile(file);
    }

    return files;
  }

  private assertUploadedFile(
    file: UploadedDocumentFile | undefined,
  ): asserts file is UploadedDocumentFile {
    if (!file?.buffer) {
      throw new BadRequestException('请上传文档文件');
    }

    if (file.size <= 0 || file.buffer.byteLength <= 0) {
      throw new BadRequestException('文档文件不能为空');
    }

    if (
      file.size > DOCUMENT_FILE_SIZE_LIMIT ||
      file.buffer.byteLength > DOCUMENT_FILE_SIZE_LIMIT
    ) {
      throw new BadRequestException('文档文件不能超过 2MB');
    }
  }

  private parseMarkdownImportPayload(fields: MarkdownImportFields) {
    const chunks = this.parseChunksField(fields.chunks);

    return {
      name: fields.name ?? '',
      description: fields.description,
      chunks,
    } satisfies MarkdownImportPayload;
  }

  private parseFileImportPayload(
    fields: FileImportFields,
    files: UploadedDocumentFile[],
  ) {
    const documents = this.parseDocumentsField(fields.documents);
    const seenFileIndexes = new Set<number>();

    if (documents.length !== files.length) {
      throw new BadRequestException('documents must match uploaded files');
    }

    for (const document of documents) {
      if (
        !Number.isInteger(document.fileIndex) ||
        document.fileIndex < 0 ||
        document.fileIndex >= files.length
      ) {
        throw new BadRequestException('document fileIndex is invalid');
      }

      if (seenFileIndexes.has(document.fileIndex)) {
        throw new BadRequestException('document fileIndex must be unique');
      }

      seenFileIndexes.add(document.fileIndex);
    }

    return documents;
  }

  private parseDocumentsField(
    documents: FileImportFields['documents'],
  ): FileImportDocumentPayload[] {
    if (Array.isArray(documents)) {
      return documents;
    }

    if (typeof documents !== 'string' || !documents.trim()) {
      throw new BadRequestException('documents are required');
    }

    try {
      const parsed = JSON.parse(documents) as FileImportDocumentPayload[];

      if (!Array.isArray(parsed)) {
        throw new Error('documents must be an array');
      }

      return parsed;
    } catch {
      throw new BadRequestException('documents must be valid JSON');
    }
  }

  private parseChunksField(
    chunks:
      | MarkdownImportFields['chunks']
      | FileImportDocumentPayload['chunks'],
  ) {
    if (Array.isArray(chunks)) {
      return chunks;
    }

    if (typeof chunks !== 'string' || !chunks.trim()) {
      throw new BadRequestException('chunks are required');
    }

    try {
      return JSON.parse(chunks) as ChunkDraftPayload[];
    } catch {
      throw new BadRequestException('chunks must be valid JSON');
    }
  }

  private getUploadFileName(file: UploadedDocumentFile | undefined) {
    return this.decodeUploadFileName(file?.originalname);
  }

  private decodeUploadFileName(originalName: string | undefined) {
    const fileName = basename(originalName?.trim() || 'document.md');

    if (!LATIN1_MOJIBAKE_PATTERN.test(fileName)) {
      return fileName;
    }

    const decodedFileName = basename(
      Buffer.from(fileName, 'latin1').toString('utf8').trim(),
    );

    if (!decodedFileName || decodedFileName.includes('�')) {
      return fileName;
    }

    return decodedFileName;
  }

  private normalizeText(content: string | undefined) {
    return content?.replace(/\r\n/g, '\n').trim() ?? '';
  }

  private normalizeTitle(title: string | null | undefined) {
    const normalizedTitle = title?.trim();

    return normalizedTitle ? normalizedTitle.slice(0, 512) : null;
  }

  private normalizeChunkMetadata(
    metadata: ChunkDraftPayload['metadata'],
  ): Prisma.InputJsonValue {
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      return metadata as Prisma.InputJsonObject;
    }

    return {};
  }

  private normalizeChunkStatus(
    status: ChunkStatus | undefined,
    fallback: ChunkStatus,
  ) {
    if (status === undefined) {
      return fallback;
    }

    if (status !== ChunkStatus.ACTIVE && status !== ChunkStatus.DISABLED) {
      throw new BadRequestException('chunk status is invalid');
    }

    return status;
  }

  private toEmbeddingText(chunk: EmbeddableChunk) {
    return chunk.title ? `${chunk.title}\n${chunk.content}` : chunk.content;
  }

  private async toEmbeddingInputs(
    chunks: EmbeddableChunk[],
    embeddingModel: EmbeddingModelConfig,
  ): Promise<EmbeddingInput[]> {
    return Promise.all(
      chunks.map(async (chunk) => {
        const text = this.toEmbeddingText(chunk);
        const assetFileId = this.getImageAssetFileIdForEmbedding(
          chunk,
          embeddingModel,
        );

        if (!assetFileId) {
          return { text };
        }

        const asset = await this.fileStorageService.readBuffer(assetFileId);

        return {
          text,
          image: {
            dataUrl: this.toDataUrl(
              asset.mimeType || 'application/octet-stream',
              asset.buffer,
            ),
          },
        };
      }),
    );
  }

  private getImageAssetFileIdForEmbedding(
    chunk: EmbeddableChunk,
    embeddingModel: EmbeddingModelConfig,
  ) {
    if (!this.isDashScopeMultimodalModel(embeddingModel)) {
      return null;
    }

    const metadata = this.toMetadataObject(chunk.metadata);

    if (metadata.contentKind !== 'PDF_PAGE_IMAGE') {
      return null;
    }

    return typeof metadata.assetFileId === 'string'
      ? metadata.assetFileId
      : null;
  }

  private isDashScopeMultimodalModel(model: EmbeddingModelConfig) {
    const config = this.toMetadataObject(model.configJson);

    return config.protocol === 'dashscope-multimodal';
  }

  private toDataUrl(mimeType: string, buffer: Buffer) {
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  }

  private toVectorLiteral(embedding: number[]) {
    return `[${embedding.join(',')}]`;
  }

  private async assertCanDeactivateChunk(chunkId: string, documentId: string) {
    const activeChunkCount = await this.prisma.chunk.count({
      where: {
        documentId,
        status: ChunkStatus.ACTIVE,
        NOT: { id: chunkId },
      },
    });

    if (activeChunkCount === 0) {
      throw new BadRequestException('document must have active chunks');
    }
  }

  private async countActiveChunks(documentId: string) {
    return this.prisma.chunk.count({
      where: { documentId, status: ChunkStatus.ACTIVE },
    });
  }

  private async requireDocument(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!document) {
      throw new NotFoundException('document does not exist');
    }

    return document;
  }

  private async requireKnowledgeBase(id: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!knowledgeBase) {
      throw new NotFoundException('knowledge base does not exist');
    }

    return knowledgeBase;
  }

  private async requireIndexableDocument(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        knowledgeBaseId: true,
        knowledgeBase: {
          select: this.indexableKnowledgeBaseSelect,
        },
      },
    });

    if (!document) {
      throw new NotFoundException('document does not exist');
    }

    const embeddingModel = this.getIndexableEmbeddingModel(
      document.knowledgeBase,
    );

    return {
      ...document,
      knowledgeBase: {
        ...document.knowledgeBase,
        embeddingModel,
      },
    };
  }

  private async requireAiExtractedTargetDocument(
    knowledgeBaseId: string,
    documentId: string,
  ) {
    const document = await this.requireIndexableDocument(documentId);

    if (document.knowledgeBaseId !== knowledgeBaseId) {
      throw new BadRequestException(
        'document does not belong to the target knowledge base',
      );
    }

    return document;
  }

  private async findOrCreateAiExtractedDocument(
    knowledgeBaseId: string,
    documentName: string | undefined,
    sourceMessageId: string,
  ) {
    const name = documentName?.trim() || '聊天补充知识';
    const existingDocument = await this.prisma.document.findFirst({
      where: {
        knowledgeBaseId,
        sourceType: DocumentSourceType.AI_EXTRACTED,
        name,
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    if (existingDocument) {
      return this.requireIndexableDocument(existingDocument.id);
    }

    const document = await this.prisma.document.create({
      data: {
        knowledgeBase: { connect: { id: knowledgeBaseId } },
        name,
        sourceType: DocumentSourceType.AI_EXTRACTED,
        status: DocumentStatus.CHUNKING,
        metadata: {
          description: '从 Agent 聊天记录标注入库的知识',
          sourceMessageId,
        },
      },
      select: { id: true },
    });

    return this.requireIndexableDocument(document.id);
  }

  private async requireIndexableChunk(id: string) {
    const chunk = await this.prisma.chunk.findUnique({
      where: { id },
      select: {
        id: true,
        documentId: true,
        title: true,
        content: true,
        status: true,
        document: {
          select: {
            knowledgeBase: {
              select: this.indexableKnowledgeBaseSelect,
            },
          },
        },
      },
    });

    if (!chunk) {
      throw new NotFoundException('chunk does not exist');
    }

    const embeddingModel = this.getIndexableEmbeddingModel(
      chunk.document.knowledgeBase,
    );

    return {
      ...chunk,
      document: {
        ...chunk.document,
        knowledgeBase: {
          ...chunk.document.knowledgeBase,
          embeddingModel,
        },
      },
    };
  }

  private async requireIndexableKnowledgeBase(id: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id },
      select: this.indexableKnowledgeBaseSelect,
    });

    if (!knowledgeBase) {
      throw new NotFoundException('knowledge base does not exist');
    }

    const embeddingModel = this.getIndexableEmbeddingModel(knowledgeBase);

    return {
      ...knowledgeBase,
      embeddingModel,
    };
  }

  private getIndexableEmbeddingModel(knowledgeBase: IndexableKnowledgeBase) {
    if (knowledgeBase.status !== KnowledgeBaseStatus.ACTIVE) {
      throw new BadRequestException('knowledge base is disabled');
    }

    if (!knowledgeBase.embeddingModel) {
      throw new BadRequestException(
        'knowledge base embedding model is not configured',
      );
    }

    if (
      knowledgeBase.embeddingModel.type !== AiModelType.EMBEDDING ||
      !knowledgeBase.embeddingModel.isEnabled
    ) {
      throw new BadRequestException(
        'knowledge base embedding model must be enabled',
      );
    }

    return knowledgeBase.embeddingModel;
  }

  private readonly indexableKnowledgeBaseSelect = {
    id: true,
    status: true,
    metadata: true,
    embeddingModel: {
      select: {
        id: true,
        type: true,
        isEnabled: true,
        modelName: true,
        baseUrl: true,
        apiKey: true,
        configJson: true,
      },
    },
    visionModel: {
      select: {
        id: true,
        type: true,
        isEnabled: true,
        modelName: true,
        baseUrl: true,
        apiKey: true,
        configJson: true,
      },
    },
  } as const;
}

type IndexableKnowledgeBase = {
  id: string;
  status: KnowledgeBaseStatus;
  metadata: Prisma.JsonValue;
  embeddingModel:
    | (EmbeddingModelConfig & {
        type: AiModelType;
        isEnabled: boolean;
      })
    | null;
  visionModel:
    | (ImageUnderstandingModelConfig & {
        type: AiModelType;
        isEnabled: boolean;
      })
    | null;
};

type IndexableKnowledgeBaseWithEmbedding = IndexableKnowledgeBase & {
  embeddingModel: EmbeddingModelConfig & {
    type: AiModelType;
    isEnabled: boolean;
  };
};

type EmbeddingModelConfig = {
  id: string;
  modelName: string;
  baseUrl: string | null;
  apiKey: string | null;
  configJson: Prisma.JsonValue;
};

type ImageUnderstandingModelConfig = EmbeddingModelConfig;
