import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@libs/shared';
import {
  AgentStatus,
  AiModelType,
  KnowledgeBaseStatus,
} from '@libs/shared/generated/prisma/enums';
import { Prisma } from '@libs/shared/generated/prisma/client';
import type { AgentPayload } from '@zeta/common/agents';
import { agentSelect } from './agents.select';

type AgentRecord = Prisma.AgentGetPayload<{ select: typeof agentSelect }>;

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const agents = await this.prisma.agent.findMany({
      orderBy: { updatedAt: 'desc' },
      select: agentSelect,
    });

    return agents.map((agent) => this.toResponse(agent));
  }

  async get(id: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id },
      select: agentSelect,
    });

    if (!agent) {
      throw new NotFoundException('agent does not exist');
    }

    return this.toResponse(agent);
  }

  async create(input: AgentPayload) {
    const data = await this.createData(input);
    const agent = await this.prisma.agent.create({
      data,
      select: agentSelect,
    });

    return this.toResponse(agent);
  }

  async update(id: string, input: Partial<AgentPayload>) {
    await this.requireAgent(id);
    const data = await this.updateData(input);
    const knowledgeBaseIds =
      input.knowledgeBaseIds === undefined
        ? undefined
        : await this.validateKnowledgeBases(input.knowledgeBaseIds);

    if (Object.keys(data).length === 0 && knowledgeBaseIds === undefined) {
      throw new BadRequestException('at least one agent field is required');
    }

    const agent = await this.prisma.$transaction(async (prisma) => {
      if (knowledgeBaseIds !== undefined) {
        await prisma.agentKnowledgeBase.deleteMany({
          where: { agentId: id },
        });

        if (knowledgeBaseIds.length > 0) {
          await prisma.agentKnowledgeBase.createMany({
            data: knowledgeBaseIds.map((knowledgeBaseId) => ({
              agentId: id,
              knowledgeBaseId,
            })),
          });
        }
      }

      return prisma.agent.update({
        where: { id },
        data,
        select: agentSelect,
      });
    });

    return this.toResponse(agent);
  }

  async remove(id: string) {
    await this.requireAgent(id);

    await this.prisma.$transaction(async (prisma) => {
      const sessions = await prisma.chatSession.findMany({
        where: { agentId: id },
        select: { id: true },
      });
      const sessionIds = sessions.map((session) => session.id);

      if (sessionIds.length > 0) {
        const messages = await prisma.chatMessage.findMany({
          where: { sessionId: { in: sessionIds } },
          select: { id: true },
        });
        const messageIds = messages.map((message) => message.id);

        if (messageIds.length > 0) {
          await prisma.chatCitation.deleteMany({
            where: { messageId: { in: messageIds } },
          });
        }

        await prisma.chatMessage.deleteMany({
          where: { sessionId: { in: sessionIds } },
        });
        await prisma.chatSession.deleteMany({
          where: { id: { in: sessionIds } },
        });
      }

      await prisma.agentKnowledgeBase.deleteMany({ where: { agentId: id } });
      await prisma.agent.delete({ where: { id } });
    });

    return { id };
  }

  private async createData(
    input: AgentPayload,
  ): Promise<Prisma.AgentCreateInput> {
    const name = input.name?.trim();
    const modelId = input.modelId?.trim();
    const systemPrompt = input.systemPrompt?.trim();

    if (!name || !modelId || !systemPrompt) {
      throw new BadRequestException(
        'name, modelId and systemPrompt are required',
      );
    }

    const knowledgeBaseIds = await this.validateKnowledgeBases(
      input.knowledgeBaseIds,
    );
    await this.requireChatModel(modelId);

    return {
      name,
      description: input.description?.trim() || null,
      model: { connect: { id: modelId } },
      systemPrompt,
      openingMessage: input.openingMessage?.trim() || null,
      status: this.parseStatus(input.status ?? AgentStatus.DRAFT),
      temperature: this.parseOptionalDecimal(
        input.temperature,
        'temperature',
        2,
      ),
      topP: this.parseOptionalDecimal(input.topP, 'topP', 1),
      agentKnowledgeBases: {
        create: knowledgeBaseIds.map((knowledgeBaseId) => ({
          knowledgeBase: { connect: { id: knowledgeBaseId } },
        })),
      },
    };
  }

  private async updateData(
    input: Partial<AgentPayload>,
  ): Promise<Prisma.AgentUpdateInput> {
    const data: Prisma.AgentUpdateInput = {};

    if (input.name !== undefined) {
      const name = input.name.trim();

      if (!name) {
        throw new BadRequestException('name cannot be empty');
      }

      data.name = name;
    }

    if (input.description !== undefined) {
      data.description = input.description?.trim() || null;
    }

    if (input.modelId !== undefined) {
      const modelId = input.modelId.trim();

      if (!modelId) {
        throw new BadRequestException('modelId cannot be empty');
      }

      await this.requireChatModel(modelId);
      data.model = { connect: { id: modelId } };
    }

    if (input.systemPrompt !== undefined) {
      const systemPrompt = input.systemPrompt.trim();

      if (!systemPrompt) {
        throw new BadRequestException('systemPrompt cannot be empty');
      }

      data.systemPrompt = systemPrompt;
    }

    if (input.openingMessage !== undefined) {
      data.openingMessage = input.openingMessage?.trim() || null;
    }

    if (input.status !== undefined) {
      data.status = this.parseStatus(input.status);
    }

    if (input.temperature !== undefined) {
      data.temperature = this.parseOptionalDecimal(
        input.temperature,
        'temperature',
        2,
      );
    }

    if (input.topP !== undefined) {
      data.topP = this.parseOptionalDecimal(input.topP, 'topP', 1);
    }

    return data;
  }

  private async requireAgent(id: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!agent) {
      throw new NotFoundException('agent does not exist');
    }
  }

  private async requireChatModel(id: string) {
    const model = await this.prisma.aiModel.findFirst({
      where: {
        id,
        type: AiModelType.CHAT,
        isEnabled: true,
      },
      select: { id: true },
    });

    if (!model) {
      throw new BadRequestException(
        'modelId must point to an enabled chat model',
      );
    }
  }

  private async validateKnowledgeBases(knowledgeBaseIds: string[] | undefined) {
    const uniqueIds = [
      ...new Set((knowledgeBaseIds ?? []).map((id) => id.trim())),
    ].filter(Boolean);

    if (uniqueIds.length === 0) {
      throw new BadRequestException(
        'agent must bind at least one knowledge base',
      );
    }

    const knowledgeBases = await this.prisma.knowledgeBase.findMany({
      where: {
        id: { in: uniqueIds },
        status: KnowledgeBaseStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (knowledgeBases.length !== uniqueIds.length) {
      throw new BadRequestException(
        'knowledgeBaseIds must point to enabled knowledge bases',
      );
    }

    return uniqueIds;
  }

  private parseStatus(value: unknown) {
    if (!Object.values(AgentStatus).includes(value as AgentStatus)) {
      throw new BadRequestException('status is invalid');
    }

    return value as AgentStatus;
  }

  private parseOptionalDecimal(
    value: number | null | undefined,
    field: string,
    max: number,
  ) {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException(`${field} must be a number`);
    }

    if (value < 0 || value > max) {
      throw new BadRequestException(`${field} must be between 0 and ${max}`);
    }

    return value;
  }

  private toResponse(agent: AgentRecord) {
    const { agentKnowledgeBases, ...visibleAgent } = agent;

    return {
      ...visibleAgent,
      temperature:
        agent.temperature === null ? null : Number(agent.temperature),
      topP: agent.topP === null ? null : Number(agent.topP),
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
      knowledgeBases: agentKnowledgeBases.map((item) => item.knowledgeBase),
    };
  }
}
