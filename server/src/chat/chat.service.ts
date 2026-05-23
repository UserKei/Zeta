import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, RetrievalService } from '@libs/shared';
import {
  AgentStatus,
  AiModelType,
  ChatMessageRole,
} from '@libs/shared/generated/prisma/enums';
import { Prisma } from '@libs/shared/generated/prisma/client';
import type {
  ChatMessage,
  ChatPayload,
  ChatResponse,
  ChatSession,
} from '@zeta/common/chat';
import type { RetrievalHit } from '@zeta/common/knowledge-docs';
import { chatMessageSelect, chatSessionSelect } from './chat.select';

type ChatSessionRecord = Prisma.ChatSessionGetPayload<{
  select: typeof chatSessionSelect;
}>;
type ChatMessageRecord = Prisma.ChatMessageGetPayload<{
  select: typeof chatMessageSelect;
}>;

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  usage?: unknown;
};

const DEFAULT_CHAT_TOP_K = 5;
const MAX_CHAT_TOP_K = 20;
const DEFAULT_TEMPERATURE = 0.2;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retrievalService: RetrievalService,
  ) {}

  async chat(
    agentId: string,
    userId: string,
    input: ChatPayload,
  ): Promise<ChatResponse> {
    const message = this.normalizeMessage(input.message);
    const topK = this.parseTopK(input.topK);
    const agent = await this.requireChatAgent(agentId);

    if (input.sessionId) {
      await this.requireOwnedSession(input.sessionId, userId, agent.id);
    }

    const retrieval = await this.retrievalService.retrieveFromKnowledgeBases(
      agent.agentKnowledgeBases.map((item) => item.knowledgeBaseId),
      message,
      topK,
    );
    const answer = await this.callChatModel(agent, message, retrieval.hits);

    const result = await this.prisma.$transaction(async (prisma) => {
      const session = input.sessionId
        ? await prisma.chatSession.update({
            where: { id: input.sessionId },
            data: { updatedAt: new Date() },
            select: chatSessionSelect,
          })
        : await prisma.chatSession.create({
            data: {
              user: { connect: { id: userId } },
              agent: { connect: { id: agent.id } },
              title: this.createSessionTitle(message),
            },
            select: chatSessionSelect,
          });

      const userMessage = await prisma.chatMessage.create({
        data: {
          session: { connect: { id: session.id } },
          role: ChatMessageRole.USER,
          content: message,
        },
        select: chatMessageSelect,
      });

      const assistantMessage = await prisma.chatMessage.create({
        data: {
          session: { connect: { id: session.id } },
          role: ChatMessageRole.ASSISTANT,
          content: answer.content,
          model: { connect: { id: agent.model.id } },
          tokenUsage: answer.usage ?? {},
          citations: {
            create: retrieval.hits.map((hit) => ({
              chunk: { connect: { id: hit.chunkId } },
              document: { connect: { id: hit.documentId } },
              score: Number(hit.score.toFixed(6)),
              quote: hit.content,
            })),
          },
        },
        select: chatMessageSelect,
      });

      return {
        session,
        userMessage,
        assistantMessage,
      };
    });

    return {
      session: this.toSessionResponse(result.session),
      userMessage: this.toMessageResponse(result.userMessage),
      assistantMessage: this.toMessageResponse(result.assistantMessage),
      hits: retrieval.hits,
    };
  }

  async listSessions(userId: string): Promise<ChatSession[]> {
    const sessions = await this.prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: chatSessionSelect,
    });

    return sessions.map((session) => this.toSessionResponse(session));
  }

  async listMessages(
    sessionId: string,
    userId: string,
  ): Promise<ChatMessage[]> {
    await this.requireOwnedSession(sessionId, userId);

    const messages = await this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: chatMessageSelect,
    });

    return messages.map((message) => this.toMessageResponse(message));
  }

  private async requireChatAgent(id: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        systemPrompt: true,
        temperature: true,
        topP: true,
        model: {
          select: {
            id: true,
            type: true,
            isEnabled: true,
            modelName: true,
            baseUrl: true,
            apiKey: true,
          },
        },
        agentKnowledgeBases: {
          select: {
            knowledgeBaseId: true,
          },
        },
      },
    });

    if (!agent) {
      throw new NotFoundException('agent does not exist');
    }

    if (agent.status === AgentStatus.DISABLED) {
      throw new BadRequestException('agent is disabled');
    }

    if (
      agent.model.type !== AiModelType.CHAT ||
      !agent.model.isEnabled ||
      !agent.model.baseUrl ||
      !agent.model.apiKey
    ) {
      throw new BadRequestException(
        'agent chat model must be enabled and configured',
      );
    }

    if (agent.agentKnowledgeBases.length === 0) {
      throw new BadRequestException(
        'agent must bind at least one knowledge base',
      );
    }

    return agent;
  }

  private async requireOwnedSession(
    id: string,
    userId: string,
    agentId?: string,
  ) {
    const session = await this.prisma.chatSession.findFirst({
      where: {
        id,
        userId,
        ...(agentId ? { agentId } : {}),
      },
      select: { id: true },
    });

    if (!session) {
      throw new NotFoundException('chat session does not exist');
    }
  }

  private async callChatModel(
    agent: Awaited<ReturnType<ChatService['requireChatAgent']>>,
    message: string,
    hits: RetrievalHit[],
  ) {
    const response = await fetch(
      `${this.trimBaseUrl(agent.model.baseUrl ?? '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agent.model.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: agent.model.modelName,
          messages: [
            {
              role: 'system',
              content: this.buildSystemPrompt(agent.systemPrompt, hits),
            },
            {
              role: 'user',
              content: message,
            },
          ],
          temperature:
            agent.temperature === null
              ? DEFAULT_TEMPERATURE
              : Number(agent.temperature),
          top_p: agent.topP === null ? undefined : Number(agent.topP),
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text();

      throw new BadGatewayException(
        `chat provider request failed: ${detail || response.statusText}`,
      );
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || !content.trim()) {
      throw new BadGatewayException('chat provider returned empty answer');
    }

    return {
      content: content.trim(),
      usage: payload.usage ?? {},
    };
  }

  private buildSystemPrompt(systemPrompt: string, hits: RetrievalHit[]) {
    const context = hits
      .map(
        (hit, index) =>
          `[${index + 1}] ${hit.documentName} / 分块 #${hit.position + 1}\n${hit.content}`,
      )
      .join('\n\n');

    return [
      systemPrompt,
      '请只基于下面的知识库上下文回答。无法从上下文确认时，明确说明暂未找到依据。',
      context ? `知识库上下文：\n${context}` : '知识库上下文：暂无命中内容。',
      '回答末尾请用“引用：”列出使用到的编号。',
    ].join('\n\n');
  }

  private normalizeMessage(message: string | undefined) {
    const normalizedMessage = message?.trim();

    if (!normalizedMessage) {
      throw new BadRequestException('message is required');
    }

    return normalizedMessage;
  }

  private parseTopK(value: number | undefined) {
    const topK = value ?? DEFAULT_CHAT_TOP_K;

    if (!Number.isInteger(topK) || topK <= 0 || topK > MAX_CHAT_TOP_K) {
      throw new BadRequestException(
        `topK must be an integer between 1 and ${MAX_CHAT_TOP_K}`,
      );
    }

    return topK;
  }

  private createSessionTitle(message: string) {
    return message.length > 40 ? `${message.slice(0, 40)}...` : message;
  }

  private trimBaseUrl(baseUrl: string) {
    return baseUrl.replace(/\/+$/, '');
  }

  private toSessionResponse(session: ChatSessionRecord): ChatSession {
    return {
      ...session,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  private toMessageResponse(message: ChatMessageRecord): ChatMessage {
    return {
      ...message,
      createdAt: message.createdAt.toISOString(),
      citations: message.citations.map((citation) => ({
        id: citation.id,
        chunkId: citation.chunkId,
        documentId: citation.documentId,
        documentName: citation.document.name,
        chunkPosition: citation.chunk.position,
        score: citation.score === null ? null : Number(citation.score),
        quote: citation.quote,
        createdAt: citation.createdAt.toISOString(),
      })),
    };
  }
}
