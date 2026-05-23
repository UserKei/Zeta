import { Prisma } from '@libs/shared/generated/prisma/client';

export const documentSelect = {
  id: true,
  knowledgeBaseId: true,
  sourceFileId: true,
  name: true,
  sourceType: true,
  status: true,
  charCount: true,
  chunkCount: true,
  errorMessage: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DocumentSelect;

export const chunkSelect = {
  id: true,
  knowledgeBaseId: true,
  documentId: true,
  title: true,
  content: true,
  position: true,
  tokenCount: true,
  charCount: true,
  status: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ChunkSelect;
