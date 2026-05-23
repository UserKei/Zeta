import { Prisma } from '@libs/shared/generated/prisma/client';

export const agentSelect = {
  id: true,
  name: true,
  description: true,
  modelId: true,
  systemPrompt: true,
  openingMessage: true,
  status: true,
  temperature: true,
  topP: true,
  createdAt: true,
  updatedAt: true,
  model: {
    select: {
      id: true,
      name: true,
      provider: true,
      modelName: true,
      isEnabled: true,
    },
  },
  agentKnowledgeBases: {
    select: {
      knowledgeBase: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  },
} satisfies Prisma.AgentSelect;
