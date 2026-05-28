import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  EmbeddingService,
  FileStorageService,
  MarkdownParserService,
  PrismaService,
  RetrievalService,
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
};

type EmbeddableChunk = {
  id: string;
  title: string | null;
  content: string;
};

export type UploadedMarkdownFile = {
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
export const MARKDOWN_FILE_SIZE_LIMIT = 2 * 1024 * 1024;

@Injectable()
export class KnowledgeDocsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly fileStorageService: FileStorageService,
    private readonly markdownParser: MarkdownParserService,
    private readonly retrievalService: RetrievalService,
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

    this.assertDocumentChunks(chunks);

    const document = await this.prisma.document.create({
      data: {
        knowledgeBase: { connect: { id: knowledgeBase.id } },
        name,
        sourceType: DocumentSourceType.MANUAL,
        status: DocumentStatus.CHUNKING,
        charCount: this.countChars(chunks),
        chunkCount: chunks.length,
        metadata: {
          description: input.description?.trim() || null,
        },
      },
      select: documentSelect,
    });

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
    file: UploadedMarkdownFile | undefined,
  ) {
    await this.requireKnowledgeBase(knowledgeBaseId);

    const content = this.getMarkdownContent(file);

    return {
      fileName: this.getUploadFileName(file),
      documentName: this.getDefaultDocumentName(file),
      chunks: this.parseMarkdownContent(content),
    };
  }

  async createMarkdownDocument(
    knowledgeBaseId: string,
    file: UploadedMarkdownFile | undefined,
    fields: MarkdownImportFields,
  ) {
    const knowledgeBase =
      await this.requireIndexableKnowledgeBase(knowledgeBaseId);
    const content = this.getMarkdownContent(file);
    const importPayload = this.parseMarkdownImportPayload(fields);
    const name =
      importPayload.name?.trim() || this.getDefaultDocumentName(file);
    const chunks = this.toChunkDrafts(importPayload.chunks);

    if (!name) {
      throw new BadRequestException('name is required');
    }

    this.assertDocumentChunks(chunks);

    const sourceFile = await this.fileStorageService.saveBuffer({
      fileName: this.getUploadFileName(file),
      mimeType: file?.mimetype || 'text/markdown',
      buffer: file!.buffer,
      metadata: {
        sourceFormat: 'MARKDOWN',
      },
    });
    let document: DocumentRecord | null = null;

    try {
      document = await this.prisma.document.create({
        data: {
          knowledgeBase: { connect: { id: knowledgeBase.id } },
          sourceFile: { connect: { id: sourceFile.id } },
          name,
          sourceType: DocumentSourceType.FILE_UPLOAD,
          status: DocumentStatus.CHUNKING,
          charCount: this.countChars(chunks),
          chunkCount: chunks.length,
          metadata: {
            description: importPayload.description?.trim() || null,
            sourceFormat: 'MARKDOWN',
            originalFileName: sourceFile.fileName,
            originalFileSize: Number(sourceFile.fileSize),
            sha256Hash: sourceFile.sha256Hash,
            originalCharCount: content.length,
          },
        },
        select: documentSelect,
      });

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
      select: { id: true, sourceFileId: true },
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
    await this.fileStorageService.removeFileIfUnreferenced(
      document.sourceFileId,
    );

    return { id: documentId };
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
      select: { id: true, title: true, content: true },
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
      await this.embeddingService.embedTexts(
        embeddingModel,
        activeChunks.map((chunk) => this.toEmbeddingText(chunk)),
      ),
    );
  }

  private async rebuildChunkEmbedding(
    chunkId: string,
    embeddingModel: EmbeddingModelConfig,
  ) {
    const chunk = await this.prisma.chunk.findUniqueOrThrow({
      where: { id: chunkId },
      select: { id: true, title: true, content: true },
    });

    await this.prisma.chunkEmbedding.deleteMany({
      where: { chunkId, embeddingModelId: embeddingModel.id },
    });

    await this.createEmbeddings(
      embeddingModel.id,
      [chunk],
      await this.embeddingService.embedTexts(embeddingModel, [
        this.toEmbeddingText(chunk),
      ]),
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

  private parseMarkdownContent(content: string) {
    return this.markdownParser.parse(content, {
      maxChunkLength: MAX_CHUNK_CONTENT_LENGTH,
      maxChunkCount: MAX_CHUNK_COUNT,
    });
  }

  private getMarkdownContent(file: UploadedMarkdownFile | undefined) {
    this.assertMarkdownFile(file);

    const content = this.normalizeText(
      file.buffer.toString('utf8').replace(/^\uFEFF/, ''),
    );

    if (!content) {
      throw new BadRequestException('Markdown 文件不能为空');
    }

    if (content.length > MAX_DOCUMENT_CONTENT_LENGTH) {
      throw new BadRequestException(
        `Markdown 内容不能超过 ${MAX_DOCUMENT_CONTENT_LENGTH} 个字符`,
      );
    }

    return content;
  }

  private assertMarkdownFile(
    file: UploadedMarkdownFile | undefined,
  ): asserts file is UploadedMarkdownFile {
    if (!file?.buffer) {
      throw new BadRequestException('请上传 Markdown 文件');
    }

    const fileName = this.getUploadFileName(file);
    const normalizedFileName = fileName.toLowerCase();

    if (
      !normalizedFileName.endsWith('.md') &&
      !normalizedFileName.endsWith('.markdown')
    ) {
      throw new BadRequestException('仅支持 .md 或 .markdown 文件');
    }

    if (file.size <= 0 || file.buffer.byteLength <= 0) {
      throw new BadRequestException('Markdown 文件不能为空');
    }

    if (
      file.size > MARKDOWN_FILE_SIZE_LIMIT ||
      file.buffer.byteLength > MARKDOWN_FILE_SIZE_LIMIT
    ) {
      throw new BadRequestException('Markdown 文件不能超过 2MB');
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

  private parseChunksField(chunks: MarkdownImportFields['chunks']) {
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

  private getUploadFileName(file: UploadedMarkdownFile | undefined) {
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

  private getDefaultDocumentName(file: UploadedMarkdownFile | undefined) {
    const fileName = this.getUploadFileName(file);
    const documentName = fileName.replace(/\.(md|markdown)$/i, '').trim();

    return documentName || 'Markdown 文档';
  }

  private normalizeText(content: string | undefined) {
    return content?.replace(/\r\n/g, '\n').trim() ?? '';
  }

  private normalizeTitle(title: string | null | undefined) {
    const normalizedTitle = title?.trim();

    return normalizedTitle ? normalizedTitle.slice(0, 512) : null;
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
  } as const;
}

type IndexableKnowledgeBase = {
  id: string;
  status: KnowledgeBaseStatus;
  embeddingModel:
    | (EmbeddingModelConfig & {
        type: AiModelType;
        isEnabled: boolean;
      })
    | null;
};

type EmbeddingModelConfig = {
  id: string;
  modelName: string;
  baseUrl: string | null;
  apiKey: string | null;
  configJson: Prisma.JsonValue;
};
