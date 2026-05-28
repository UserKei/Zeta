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
  ChatImproveDeleteResponse,
  ChatImprovePayload,
  ChatImproveRecord,
  ChatImproveRecordDetail,
  ChatImproveResponse,
  ChatMessage,
  ChatPayload,
  ChatResponse,
  ChatSession,
  ChatStreamEvent,
} from '@zeta/common/chat';
import type { RetrievalHit } from '@zeta/common/knowledge-docs';
import { KnowledgeDocsService } from '../knowledge-docs/knowledge-docs.service';
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

type ChatCompletionStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: unknown;
  };
};

const DEFAULT_CHAT_TOP_K = 5;
const MAX_CHAT_TOP_K = 20;
const DEFAULT_TEMPERATURE = 0.2;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retrievalService: RetrievalService,
    private readonly knowledgeDocsService: KnowledgeDocsService,
  ) {}

  async chat(
    agentId: string,
    userId: string,
    input: ChatPayload,
  ): Promise<ChatResponse> {
    const { message, agent, retrieval } = await this.prepareChat(
      agentId,
      userId,
      input,
    );
    const answer = await this.callChatModel(agent, message, retrieval.hits);

    return this.saveChatResult(
      agent,
      userId,
      input.sessionId,
      message,
      answer,
      retrieval.hits,
    );
  }

  async *streamChat(
    agentId: string,
    userId: string,
    input: ChatPayload,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent> {
    const { message, agent, retrieval } = await this.prepareChat(
      agentId,
      userId,
      input,
    );
    let content = '';

    for await (const delta of this.callChatModelStream(
      agent,
      message,
      retrieval.hits,
      signal,
    )) {
      content += delta;

      yield {
        type: 'delta',
        role: 'assistant',
        content: delta,
      };
    }

    if (!content.trim()) {
      throw new BadGatewayException('chat provider returned empty answer');
    }

    const response = await this.saveChatResult(
      agent,
      userId,
      input.sessionId,
      message,
      {
        content: content.trim(),
        usage: {},
      },
      retrieval.hits,
    );

    yield {
      type: 'done',
      response,
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

  async improveMessage(
    messageId: string,
    userId: string,
    input: ChatImprovePayload,
  ): Promise<ChatImproveResponse> {
    const message = await this.requireImproveTargetMessage(messageId, userId);
    const isBoundKnowledgeBase = message.session.agent.agentKnowledgeBases.some(
      (item) => item.knowledgeBaseId === input.knowledgeBaseId,
    );

    if (!isBoundKnowledgeBase) {
      throw new BadRequestException(
        'knowledge base is not bound to this agent',
      );
    }

    const result = await this.knowledgeDocsService.createAiExtractedChunk(
      input.knowledgeBaseId,
      {
        title: input.title,
        content: input.content,
        documentId: input.documentId,
        documentName: input.documentName,
        sourceMessageId: message.id,
      },
    );
    const metadata = this.toMetadataObject(message.metadata);
    const improveRecord: ChatImproveRecord = {
      knowledgeBaseId: input.knowledgeBaseId,
      documentId: result.document.id,
      documentName: result.document.name,
      chunkId: result.chunk.id,
      chunkTitle: result.chunk.title,
      chunkPosition: result.chunk.position,
      createdAt: new Date().toISOString(),
    };
    const updated = await this.prisma.chatMessage.update({
      where: { id: message.id },
      data: {
        metadata: {
          ...metadata,
          improveRecords: [
            ...this.toImproveRecords(message.metadata),
            improveRecord,
          ],
        },
      },
      select: chatMessageSelect,
    });

    return {
      message: this.toMessageResponse(updated),
      improveRecord,
    };
  }

  async listImproveRecords(
    messageId: string,
    userId: string,
  ): Promise<ChatImproveRecordDetail[]> {
    const message = await this.requireImproveTargetMessage(messageId, userId);

    return this.toImproveRecordDetails(this.toImproveRecords(message.metadata));
  }

  async removeImproveRecord(
    messageId: string,
    userId: string,
    chunkId: string,
  ): Promise<ChatImproveDeleteResponse> {
    const message = await this.requireImproveTargetMessage(messageId, userId);
    const metadata = this.toMetadataObject(message.metadata);
    const improveRecords = this.toImproveRecords(message.metadata);
    const deletedRecord = improveRecords.find(
      (record) => record.chunkId === chunkId,
    );

    if (!deletedRecord) {
      throw new NotFoundException('improve record does not exist');
    }

    await this.knowledgeDocsService.removeImprovedChunk(chunkId);

    const updated = await this.prisma.chatMessage.update({
      where: { id: message.id },
      data: {
        metadata: {
          ...metadata,
          improveRecords: improveRecords.filter(
            (record) => record.chunkId !== chunkId,
          ),
        },
      },
      select: chatMessageSelect,
    });

    return {
      message: this.toMessageResponse(updated),
      deletedRecord,
    };
  }

  private async prepareChat(
    agentId: string,
    userId: string,
    input: ChatPayload,
  ) {
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

    return {
      message,
      agent,
      retrieval,
    };
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

    const model = agent.model;

    if (!model) {
      throw new BadRequestException('agent chat model is not configured');
    }

    if (
      model.type !== AiModelType.CHAT ||
      !model.isEnabled ||
      !model.baseUrl ||
      !model.apiKey
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

    return { ...agent, model };
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

  private async requireImproveTargetMessage(messageId: string, userId: string) {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        role: true,
        metadata: true,
        session: {
          select: {
            userId: true,
            agent: {
              select: {
                agentKnowledgeBases: {
                  select: {
                    knowledgeBaseId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!message || message.session.userId !== userId) {
      throw new NotFoundException('chat message does not exist');
    }

    if (message.role !== ChatMessageRole.ASSISTANT) {
      throw new BadRequestException('only assistant messages can be improved');
    }

    return message;
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
        body: JSON.stringify(
          this.createChatCompletionBody(agent, message, hits, false),
        ),
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

  private async *callChatModelStream(
    agent: Awaited<ReturnType<ChatService['requireChatAgent']>>,
    message: string,
    hits: RetrievalHit[],
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    const response = await fetch(
      `${this.trimBaseUrl(agent.model.baseUrl ?? '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agent.model.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          this.createChatCompletionBody(agent, message, hits, true),
        ),
        signal,
      },
    );

    if (!response.ok) {
      const detail = await response.text();

      throw new BadGatewayException(
        `chat provider request failed: ${detail || response.statusText}`,
      );
    }

    if (!response.body) {
      throw new BadGatewayException('chat provider did not return stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? '';

        for (const block of blocks) {
          for (const delta of this.parseChatStreamBlock(block)) {
            yield delta;
          }
        }
      }

      buffer += decoder.decode();

      if (buffer.trim()) {
        for (const delta of this.parseChatStreamBlock(buffer)) {
          yield delta;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private parseChatStreamBlock(block: string) {
    const deltas: string[] = [];

    for (const line of block.split(/\r?\n/)) {
      const trimmedLine = line.trim();

      if (!trimmedLine.startsWith('data:')) {
        continue;
      }

      const data = trimmedLine.slice('data:'.length).trim();

      if (!data || data === '[DONE]') {
        continue;
      }

      let payload: ChatCompletionStreamChunk;

      try {
        payload = JSON.parse(data) as ChatCompletionStreamChunk;
      } catch {
        throw new BadGatewayException(
          'chat provider returned invalid stream chunk',
        );
      }

      const providerError = payload.error?.message;

      if (typeof providerError === 'string' && providerError) {
        throw new BadGatewayException(
          `chat provider request failed: ${providerError}`,
        );
      }

      const content = payload.choices?.[0]?.delta?.content;

      if (typeof content === 'string' && content) {
        deltas.push(content);
      }
    }

    return deltas;
  }

  private createChatCompletionBody(
    agent: Awaited<ReturnType<ChatService['requireChatAgent']>>,
    message: string,
    hits: RetrievalHit[],
    stream: boolean,
  ) {
    const body = {
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
    };

    return stream ? { ...body, stream: true } : body;
  }

  private async saveChatResult(
    agent: Awaited<ReturnType<ChatService['requireChatAgent']>>,
    userId: string,
    sessionId: string | undefined,
    message: string,
    answer: {
      content: string;
      usage: unknown;
    },
    hits: RetrievalHit[],
  ): Promise<ChatResponse> {
    const result = await this.prisma.$transaction(async (prisma) => {
      const session = sessionId
        ? await prisma.chatSession.update({
            where: { id: sessionId },
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
            create: hits.map((hit) => ({
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
      hits,
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
    const { metadata, ...messageData } = message;

    return {
      ...messageData,
      createdAt: message.createdAt.toISOString(),
      improveRecords: this.toImproveRecords(metadata),
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

  private toMetadataObject(
    metadata: Prisma.JsonValue,
  ): Record<string, unknown> {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return {};
    }

    return { ...metadata };
  }

  private toImproveRecords(metadata: Prisma.JsonValue): ChatImproveRecord[] {
    const value = this.toMetadataObject(metadata).improveRecords;

    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is ChatImproveRecord => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return false;
      }

      const record = item as Partial<ChatImproveRecord>;

      return (
        typeof record.knowledgeBaseId === 'string' &&
        typeof record.documentId === 'string' &&
        typeof record.documentName === 'string' &&
        typeof record.chunkId === 'string' &&
        typeof record.chunkPosition === 'number' &&
        typeof record.createdAt === 'string'
      );
    });
  }

  private async toImproveRecordDetails(
    records: ChatImproveRecord[],
  ): Promise<ChatImproveRecordDetail[]> {
    if (records.length === 0) {
      return [];
    }

    const chunks = await this.prisma.chunk.findMany({
      where: { id: { in: records.map((record) => record.chunkId) } },
      select: {
        id: true,
        title: true,
        content: true,
        position: true,
        document: {
          select: {
            id: true,
            name: true,
            knowledgeBaseId: true,
          },
        },
      },
    });
    const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

    return records
      .map((record) => {
        const chunk = chunksById.get(record.chunkId);

        if (!chunk) {
          return null;
        }

        return {
          ...record,
          knowledgeBaseId: chunk.document.knowledgeBaseId,
          documentId: chunk.document.id,
          documentName: chunk.document.name,
          chunkTitle: chunk.title,
          chunkPosition: chunk.position,
          content: chunk.content,
        };
      })
      .filter((record): record is ChatImproveRecordDetail => record !== null);
  }
}
