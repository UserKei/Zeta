import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { basename } from 'node:path';
import {
  FileParserService,
  FileStorageService,
  PrismaService,
  type FileParseResult,
} from '@libs/shared';
import {
  AiModelType,
  DocumentSourceType,
  DocumentStatus,
  KnowledgeBaseStatus,
} from '@libs/shared/generated/prisma/enums';
import type { Prisma } from '@libs/shared/generated/prisma/client';
import type {
  ChunkDraftPayload,
  FileImportDocumentPayload,
  FilePreviewResult,
  MarkdownImportPayload,
} from '@zeta/common/knowledge-docs';
import {
  DOCUMENT_FILE_COUNT_LIMIT,
  DOCUMENT_FILE_SIZE_LIMIT,
  MAX_CHUNK_CONTENT_LENGTH,
  MAX_CHUNK_COUNT,
  MAX_DOCUMENT_CONTENT_LENGTH,
} from './knowledge-docs.constants';
import {
  assertDocumentChunks,
  countChunkChars,
  toChunkDrafts,
  type ChunkDraft,
} from './chunk-draft-normalizer';
import {
  DocumentAssetService,
  type ImageUnderstandingWarning,
} from './document-asset.service';
import {
  ChunkIndexingService,
  type EmbeddingModelConfig,
} from './chunk-indexing.service';
import { documentSelect } from './knowledge-docs.select';

type DocumentRecord = Prisma.DocumentGetPayload<{
  select: typeof documentSelect;
}>;

type KnowledgeBaseChunkConfig = {
  chunkSize: number;
  chunkOverlap: number;
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

const LATIN1_MOJIBAKE_PATTERN = /[\u0080-\u009f]/;

@Injectable()
export class DocumentImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorageService: FileStorageService,
    private readonly fileParser: FileParserService,
    private readonly documentAssetService: DocumentAssetService,
    private readonly chunkIndexingService: ChunkIndexingService,
  ) {}

  async previewMarkdownFile(
    knowledgeBaseId: string,
    file: UploadedDocumentFile | undefined,
  ) {
    const knowledgeBase = await this.requireKnowledgeBase(knowledgeBaseId);
    const parsedFile = await this.parseUploadedFile(file, knowledgeBase);

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
    const knowledgeBase = await this.requireKnowledgeBase(knowledgeBaseId);
    const uploadedFiles = this.assertUploadedFiles(files);

    return {
      files: await Promise.all(
        uploadedFiles.map(async (file, fileIndex) => {
          const parsedFile = await this.parseUploadedFile(file, knowledgeBase);

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
    const knowledgeBase = await this.requireKnowledgeBase(knowledgeBaseId);
    const parsedFile = await this.parseUploadedFile(file, knowledgeBase);

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
      const parsedFile = await this.parseUploadedFile(file, knowledgeBase);
      const chunks = toChunkDrafts(importDocument.chunks);
      const name = importDocument.name?.trim() || parsedFile.documentName;

      if (!name) {
        throw new BadRequestException('name is required');
      }

      assertDocumentChunks(chunks);

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
    const originalCharCount = countChunkChars(input.chunks);
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
          charCount: countChunkChars(chunks),
          chunkCount: chunks.length,
          metadata: documentMetadata,
        },
        select: documentSelect,
      });

      const assets = await this.documentAssetService.saveParsedAssets(
        document.id,
        sourceFile.id,
        parsedFile,
      );
      const imageUnderstandingWarnings: ImageUnderstandingWarning[] = [];

      if (assets.length > 0) {
        chunks = this.documentAssetService.rewriteChunkAssetReferences(
          chunks,
          assets,
        );
      }

      if (assets.length > 0) {
        const imageUnderstandingResult =
          await this.documentAssetService.createImageUnderstandingChunks(
            knowledgeBase,
            assets,
            chunks,
          );

        chunks = [...chunks, ...imageUnderstandingResult.chunks];
        imageUnderstandingWarnings.push(...imageUnderstandingResult.warnings);
      }

      if (assets.length > 0 || imageUnderstandingWarnings.length > 0) {
        assertDocumentChunks(chunks);

        await this.prisma.document.update({
          where: { id: document.id },
          data: {
            charCount: countChunkChars(chunks),
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

      await this.chunkIndexingService.createChunks(
        knowledgeBase.id,
        document.id,
        chunks,
      );
      await this.chunkIndexingService.refreshDocumentSearchVector(document.id);

      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.EMBEDDING, errorMessage: null },
      });

      await this.chunkIndexingService.rebuildDocumentEmbeddings(
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

  private async parseUploadedFile(
    file: UploadedDocumentFile | undefined,
    knowledgeBase: KnowledgeBaseChunkConfig,
  ) {
    this.assertUploadedFile(file);

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
        fileName: this.getUploadFileName(file),
        mimeType: file.mimetype,
        buffer: file.buffer,
      },
      {
        maxChunkLength,
        overlapLength,
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

  private async requireKnowledgeBase(id: string) {
    const knowledgeBase = await this.prisma.knowledgeBase.findUnique({
      where: { id },
      select: { id: true, chunkSize: true, chunkOverlap: true },
    });

    if (!knowledgeBase) {
      throw new NotFoundException('knowledge base does not exist');
    }

    return knowledgeBase;
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

  private readonly indexableKnowledgeBaseSelect = {
    id: true,
    status: true,
    metadata: true,
    chunkSize: true,
    chunkOverlap: true,
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
  chunkSize: number;
  chunkOverlap: number;
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

type ImageUnderstandingModelConfig = EmbeddingModelConfig;
