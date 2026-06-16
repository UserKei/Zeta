import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { basename } from 'node:path';
import {
  FileParserService,
  FileStorageService,
  PrismaService,
  type FileParseResult,
} from '@libs/shared';
import {
  DocumentSourceType,
  DocumentStatus,
} from '@libs/shared/generated/prisma/enums';
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
import { DocumentAssetService } from './document-asset.service';
import { ChunkIndexingService } from './chunk-indexing.service';
import { DocumentProcessingJobService } from './document-processing-job.service';
import { documentSelect } from './knowledge-docs.select';
import {
  toDocumentResponse,
  type DocumentRecord,
} from './document-response.mapper';
import {
  indexableKnowledgeBaseSelect,
  withIndexableEmbeddingModel,
  type IndexableKnowledgeBaseWithEmbedding,
} from './knowledge-base-model-resolver';

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
    @Optional()
    private readonly documentProcessingJobService?: DocumentProcessingJobService,
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
    const documents: Array<ReturnType<typeof toDocumentResponse>> = [];

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

      if (this.shouldQueueOcr(parsedFile, chunks)) {
        if (!this.documentProcessingJobService) {
          throw new Error('document processing queue is not configured');
        }

        document = await this.prisma.document.create({
          data: {
            knowledgeBase: { connect: { id: knowledgeBase.id } },
            sourceFile: { connect: { id: sourceFile.id } },
            name: input.name,
            sourceType: DocumentSourceType.FILE_UPLOAD,
            status: DocumentStatus.OCR_PENDING,
            charCount: 0,
            chunkCount: 0,
            metadata: {
              ...documentMetadata,
              processingStage: 'OCR',
            },
          },
          select: documentSelect,
        });

        await this.documentProcessingJobService.enqueueOcrDocument({
          documentId: document.id,
          knowledgeBaseId: knowledgeBase.id,
          sourceFileId: sourceFile.id,
        });

        return toDocumentResponse(document);
      }

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

      if (assets.length > 0) {
        chunks = this.documentAssetService.rewriteChunkAssetReferences(
          chunks,
          assets,
        );
      }

      if (assets.length > 0) {
        assertDocumentChunks(chunks);

        document = await this.prisma.document.update({
          where: { id: document.id },
          data: {
            charCount: countChunkChars(chunks),
            chunkCount: chunks.length,
            metadata: {
              ...documentMetadata,
              assets,
            },
          },
          select: documentSelect,
        });
      }

      await this.chunkIndexingService.createChunks(
        knowledgeBase.id,
        document.id,
        chunks,
      );
      await this.chunkIndexingService.refreshDocumentSearchVector(document.id);

      if (!this.documentProcessingJobService) {
        throw new Error('document processing queue is not configured');
      }

      if (assets.length > 0) {
        await this.documentProcessingJobService.enqueueImageUnderstanding({
          documentId: document.id,
          knowledgeBaseId: knowledgeBase.id,
        });

        return toDocumentResponse(document);
      }

      const embeddingDocument = await this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.EMBEDDING, errorMessage: null },
        select: documentSelect,
      });

      await this.documentProcessingJobService.enqueueDocumentEmbedding({
        documentId: document.id,
        knowledgeBaseId: knowledgeBase.id,
        requestedAt: embeddingDocument.updatedAt.toISOString(),
      });

      return toDocumentResponse(embeddingDocument);
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

  private shouldQueueOcr(parsedFile: FileParseResult, chunks: ChunkDraft[]) {
    return (
      parsedFile.sourceFormat === 'PDF' &&
      chunks.length > 0 &&
      chunks.every((chunk) => this.isPdfPageImageChunk(chunk))
    );
  }

  private isPdfPageImageChunk(chunk: ChunkDraft) {
    const metadata = chunk.metadata;

    if (
      typeof metadata !== 'object' ||
      metadata === null ||
      Array.isArray(metadata)
    ) {
      return false;
    }

    return (
      (metadata as Record<string, unknown>).contentKind === 'PDF_PAGE_IMAGE'
    );
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
      select: indexableKnowledgeBaseSelect,
    });

    if (!knowledgeBase) {
      throw new NotFoundException('knowledge base does not exist');
    }

    return withIndexableEmbeddingModel(knowledgeBase);
  }
}
