import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { ChunkStatus } from '@libs/shared/generated/prisma/enums';
import { Prisma } from '@libs/shared/generated/prisma/client';
import type { ChunkDraftPayload } from '@zeta/common/knowledge-docs';
import type { DocumentChunkDraft } from './document-asset.service';
import {
  MAX_CHUNK_CONTENT_LENGTH,
  MAX_CHUNK_COUNT,
  MAX_DOCUMENT_CONTENT_LENGTH,
} from './knowledge-docs.constants';

export type ChunkDraft = DocumentChunkDraft;

export function toChunkDrafts(chunks: ChunkDraftPayload[] | undefined) {
  if (!Array.isArray(chunks)) {
    throw new BadRequestException('chunks are required');
  }

  return chunks.map((chunk, index) => toSingleChunkDraft(chunk, index));
}

export function toSingleChunkDraft(
  input: ChunkDraftPayload,
  position: number,
): ChunkDraft {
  const content = normalizeText(input.content);

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
    title: normalizeTitle(input.title),
    content,
    status: normalizeChunkStatus(input.status, ChunkStatus.ACTIVE),
    position,
    charCount: content.length,
    metadata: normalizeChunkMetadata(input.metadata),
  };
}

export function assertDocumentChunks(chunks: ChunkDraft[]) {
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

  if (countChunkChars(chunks) > MAX_DOCUMENT_CONTENT_LENGTH) {
    throw new BadRequestException(
      `document content cannot exceed ${MAX_DOCUMENT_CONTENT_LENGTH} characters`,
    );
  }
}

export function countChunkChars(chunks: Array<{ charCount: number }>) {
  return chunks.reduce((total, chunk) => total + chunk.charCount, 0);
}

export function normalizeText(content: string | undefined) {
  return content?.replace(/\r\n/g, '\n').trim() ?? '';
}

export function normalizeTitle(title: string | null | undefined) {
  const normalizedTitle = title?.trim();

  return normalizedTitle ? normalizedTitle.slice(0, 512) : null;
}

export function normalizeChunkMetadata(
  metadata: ChunkDraftPayload['metadata'],
): Prisma.InputJsonValue {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Prisma.InputJsonObject;
  }

  return {};
}

export function normalizeChunkStatus(
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
