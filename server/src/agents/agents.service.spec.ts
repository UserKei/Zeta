import { BadRequestException } from '@nestjs/common';

jest.mock('@libs/shared', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('@libs/shared/generated/prisma/client', () => ({
  Prisma: {},
}));

jest.mock('@libs/shared/generated/prisma/enums', () => ({
  AgentStatus: {
    DRAFT: 'DRAFT',
    PUBLISHED: 'PUBLISHED',
    DISABLED: 'DISABLED',
  },
  AiModelType: {
    CHAT: 'CHAT',
  },
  KnowledgeBaseStatus: {
    ACTIVE: 'ACTIVE',
    DISABLED: 'DISABLED',
  },
}));

import { AgentStatus } from '@libs/shared/generated/prisma/enums';
import { AgentsService } from './agents.service';

const now = new Date('2026-06-01T09:00:00.000Z');

const agentRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'agent-1',
  name: '简易智能体',
  description: '先创建基础信息',
  modelId: null,
  systemPrompt: '你是企业知识库专家，请基于知识库上下文回答问题。',
  openingMessage: null,
  status: AgentStatus.DRAFT,
  temperature: null,
  topP: null,
  createdAt: now,
  updatedAt: now,
  model: null,
  agentKnowledgeBases: [],
  ...overrides,
});

type AgentCreateInput = {
  data: {
    name: string;
    description: string | null;
    status: AgentStatus;
    systemPrompt: string;
    model?: unknown;
    agentKnowledgeBases?: unknown;
  };
};

type TransactionClient = {
  agentKnowledgeBase: {
    deleteMany: jest.Mock;
    createMany: jest.Mock;
  };
  agent: {
    update: jest.Mock;
  };
};

describe('AgentsService settings workflow', () => {
  const createService = (prisma: Record<string, unknown>) =>
    new AgentsService(prisma as never);

  it('creates a draft agent with only name and description', async () => {
    const agentCreate = jest
      .fn<Promise<ReturnType<typeof agentRecord>>, [AgentCreateInput]>()
      .mockResolvedValue(agentRecord());
    const service = createService({
      agent: {
        create: agentCreate,
      },
    });

    const result = await service.create({
      name: '  简易智能体  ',
      description: '  先创建基础信息  ',
    });

    const createInput = agentCreate.mock.calls[0]?.[0];

    expect(createInput).toBeDefined();
    expect(createInput?.data.name).toBe('简易智能体');
    expect(createInput?.data.description).toBe('先创建基础信息');
    expect(createInput?.data.status).toBe(AgentStatus.DRAFT);
    expect(createInput?.data.systemPrompt).toContain('知识库');
    expect(createInput?.data.model).toBeUndefined();
    expect(createInput?.data.agentKnowledgeBases).toBeUndefined();
    expect(result.model).toBeNull();
    expect(result.knowledgeBases).toEqual([]);
  });

  it('allows clearing all bound knowledge bases in settings', async () => {
    const deleteMany = jest.fn();
    const createMany = jest.fn();
    const update = jest.fn().mockResolvedValue(agentRecord());
    const service = createService({
      agent: {
        findUnique: jest.fn().mockResolvedValue({ id: 'agent-1' }),
      },
      $transaction: jest.fn(
        async (callback: (client: TransactionClient) => Promise<unknown>) =>
          callback({
            agentKnowledgeBase: {
              deleteMany,
              createMany,
            },
            agent: {
              update,
            },
          }),
      ),
    });

    await service.update('agent-1', { knowledgeBaseIds: [] });

    expect(deleteMany).toHaveBeenCalledWith({ where: { agentId: 'agent-1' } });
    expect(createMany).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'agent-1' },
      }),
    );
  });

  it('still rejects a blank agent name', async () => {
    const service = createService({
      agent: {
        create: jest.fn(),
      },
    });

    await expect(service.create({ name: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
