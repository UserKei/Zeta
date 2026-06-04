import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ChatModelService, type ChatModelRequest } from '@libs/model-adapters';
import { PrismaService, RetrievalService } from '@libs/shared';
import { buildAnswerContextText } from '@libs/shared/retrieval/retrieval-text';
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
  ChatSessionSummary,
  ChatStreamEvent,
} from '@zeta/common/chat';
import type { RetrievalHit } from '@zeta/common/knowledge-docs';
import { AiExtractedDocumentService } from '../knowledge-docs/ai-extracted-document.service';
import { KnowledgeDocsService } from '../knowledge-docs/knowledge-docs.service';
import { chatMessageSelect, chatSessionSelect } from './chat.select';

type ChatSessionRecord = Prisma.ChatSessionGetPayload<{
  select: typeof chatSessionSelect;
}>;
type ChatMessageRecord = Prisma.ChatMessageGetPayload<{
  select: typeof chatMessageSelect;
}>;

const DEFAULT_CHAT_TOP_K = 5;
const MAX_CHAT_TOP_K = 20;
const CHAT_CITATION_LIMIT = 3;
const DEFAULT_TEMPERATURE = 0.2;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly retrievalService: RetrievalService,
    private readonly knowledgeDocsService: KnowledgeDocsService,
    private readonly aiExtractedDocumentService: AiExtractedDocumentService,
    private readonly chatModelService: ChatModelService,
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

  async listAgentSessionSummaries(
    agentId: string,
    userId: string,
  ): Promise<ChatSessionSummary[]> {
    const sessions = await this.prisma.chatSession.findMany({
      where: { userId, agentId },
      orderBy: { updatedAt: 'desc' },
      select: chatSessionSelect,
    });
    const sessionIds = sessions.map((session) => session.id);

    if (sessionIds.length === 0) {
      return [];
    }

    const messageRows = await this.prisma.chatMessage.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { sessionId: true, metadata: true },
    });
    const stats = new Map(
      sessionIds.map((sessionId) => [
        sessionId,
        { messageCount: 0, improveCount: 0 },
      ]),
    );

    for (const message of messageRows) {
      const sessionStats = stats.get(message.sessionId);

      if (!sessionStats) {
        continue;
      }

      sessionStats.messageCount += 1;
      sessionStats.improveCount += this.toImproveRecords(
        message.metadata,
      ).length;
    }

    return sessions.map((session) => ({
      ...this.toSessionResponse(session),
      ...(stats.get(session.id) ?? { messageCount: 0, improveCount: 0 }),
    }));
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

    const transactionResult = await this.prisma.$transaction(async (tx) => {
      const result = await this.aiExtractedDocumentService.createChunkRecord(
        input.knowledgeBaseId,
        {
          title: input.title,
          content: input.content,
          documentId: input.documentId,
          documentName: input.documentName,
          sourceMessageId: message.id,
        },
        tx,
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
      const updated = await tx.chatMessage.update({
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
        result,
        updated,
        improveRecord,
      };
    });

    try {
      await this.aiExtractedDocumentService.indexCreatedChunk(
        transactionResult.result,
      );
    } catch (error) {
      await this.cleanupFailedImproveIndex(
        transactionResult.updated,
        transactionResult.improveRecord,
        error,
      );
      throw error;
    }

    return {
      message: this.toMessageResponse(transactionResult.updated),
      improveRecord: transactionResult.improveRecord,
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

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.knowledgeDocsService.removeImprovedChunk(chunkId, tx);

      return tx.chatMessage.update({
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
    });

    return {
      message: this.toMessageResponse(updated),
      deletedRecord,
    };
  }

  private async cleanupFailedImproveIndex(
    message: ChatMessageRecord,
    improveRecord: ChatImproveRecord,
    cause: unknown,
  ) {
    try {
      const metadata = this.toMetadataObject(message.metadata);
      const improveRecords = this.toImproveRecords(message.metadata);

      await this.prisma.$transaction(async (tx) => {
        await this.knowledgeDocsService.removeImprovedChunk(
          improveRecord.chunkId,
          tx,
        );

        await tx.chatMessage.update({
          where: { id: message.id },
          data: {
            metadata: {
              ...metadata,
              improveRecords: improveRecords.filter(
                (record) => record.chunkId !== improveRecord.chunkId,
              ),
            },
          },
        });
      });
    } catch (cleanupError) {
      this.logger.error(
        `failed to cleanup improve record ${improveRecord.chunkId} after indexing failure`,
        cleanupError instanceof Error ? cleanupError.stack : undefined,
        cause instanceof Error ? cause.message : undefined,
      );
    }
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
    return this.chatModelService.complete(
      this.createChatModelRequest(agent, message, hits),
    );
  }

  private async *callChatModelStream(
    agent: Awaited<ReturnType<ChatService['requireChatAgent']>>,
    message: string,
    hits: RetrievalHit[],
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    yield* this.chatModelService.stream(
      this.createChatModelRequest(agent, message, hits, signal),
    );
  }

  private createChatModelRequest(
    agent: Awaited<ReturnType<ChatService['requireChatAgent']>>,
    message: string,
    hits: RetrievalHit[],
    signal?: AbortSignal,
  ): ChatModelRequest {
    return {
      apiKey: agent.model.apiKey,
      baseUrl: agent.model.baseUrl,
      modelName: agent.model.modelName,
      messages: [
        ['system', this.buildSystemPrompt(agent.systemPrompt, hits)],
        ['human', message],
      ],
      temperature:
        agent.temperature === null
          ? DEFAULT_TEMPERATURE
          : Number(agent.temperature),
      topP: agent.topP === null ? undefined : Number(agent.topP),
      signal,
    };
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
            create: hits.slice(0, CHAT_CITATION_LIMIT).map((hit) => ({
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
          `[${index + 1}] ${hit.documentName} / 分块 #${hit.position + 1}\n${buildAnswerContextText(hit)}`,
      )
      .join('\n\n');

    return [
      systemPrompt,
      '请只基于下面的知识库上下文回答。无法从上下文确认时，明确说明暂未找到依据。',
      context ? `知识库上下文：\n${context}` : '知识库上下文：暂无命中内容。',
      '不要在回答正文中输出“引用：”、引用编号、来源列表或上下文编号；引用来源由系统界面单独展示。',
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
