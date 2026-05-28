import { Prisma } from '@libs/shared/generated/prisma/client';

export const chatSessionSelect = {
  id: true,
  userId: true,
  agentId: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  agent: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.ChatSessionSelect;

export const chatMessageSelect = {
  id: true,
  sessionId: true,
  role: true,
  content: true,
  modelId: true,
  tokenUsage: true,
  metadata: true,
  createdAt: true,
  citations: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      chunkId: true,
      documentId: true,
      score: true,
      quote: true,
      createdAt: true,
      document: {
        select: {
          name: true,
        },
      },
      chunk: {
        select: {
          position: true,
        },
      },
    },
  },
} satisfies Prisma.ChatMessageSelect;
