import { BadRequestException, NotFoundException } from '@nestjs/common';

jest.mock('@libs/shared', () => ({
  ChatModelService: class ChatModelService {},
  PrismaService: class PrismaService {},
  RetrievalService: class RetrievalService {},
}));

jest.mock('@libs/shared/generated/prisma/client', () => ({
  Prisma: {},
}));

jest.mock('@libs/shared/generated/prisma/enums', () => ({
  AgentStatus: {
    DISABLED: 'DISABLED',
  },
  AiModelType: {
    CHAT: 'CHAT',
  },
  ChatMessageRole: {
    USER: 'USER',
    ASSISTANT: 'ASSISTANT',
  },
}));

import { ChatMessageRole } from '@libs/shared/generated/prisma/enums';
import type { ChatStreamEvent } from '@zeta/common/chat';
import { ChatService } from './chat.service';

describe('ChatService improveMessage', () => {
  const knowledgeDocsService = {
    createAiExtractedChunk: jest.fn(),
    removeImprovedChunk: jest.fn(),
  };
  const chatModelService = {
    complete: jest.fn(),
    stream: jest.fn(),
  };

  const createService = (
    prisma: Record<string, unknown>,
    retrievalService: Record<string, unknown> = {},
  ) =>
    new ChatService(
      prisma as never,
      retrievalService as never,
      knowledgeDocsService as never,
      chatModelService as never,
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects non-assistant messages', async () => {
    const service = createService({
      chatMessage: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'message-1',
          role: ChatMessageRole.USER,
          session: {
            userId: 'user-1',
            agent: { agentKnowledgeBases: [] },
          },
        }),
      },
    });

    await expect(
      service.improveMessage('message-1', 'user-1', {
        knowledgeBaseId: 'kb-1',
        content: '补充内容',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(knowledgeDocsService.createAiExtractedChunk).not.toHaveBeenCalled();
  });

  it('rejects messages owned by another user', async () => {
    const service = createService({
      chatMessage: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'message-1',
          role: ChatMessageRole.ASSISTANT,
          session: {
            userId: 'other-user',
            agent: { agentKnowledgeBases: [] },
          },
        }),
      },
    });

    await expect(
      service.improveMessage('message-1', 'user-1', {
        knowledgeBaseId: 'kb-1',
        content: '补充内容',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(knowledgeDocsService.createAiExtractedChunk).not.toHaveBeenCalled();
  });

  it('rejects knowledge bases not bound to the agent', async () => {
    const service = createService({
      chatMessage: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'message-1',
          role: ChatMessageRole.ASSISTANT,
          session: {
            userId: 'user-1',
            agent: {
              agentKnowledgeBases: [{ knowledgeBaseId: 'kb-2' }],
            },
          },
        }),
      },
    });

    await expect(
      service.improveMessage('message-1', 'user-1', {
        knowledgeBaseId: 'kb-1',
        content: '补充内容',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(knowledgeDocsService.createAiExtractedChunk).not.toHaveBeenCalled();
  });

  it('creates an extracted chunk and stores improve metadata', async () => {
    const updatedAt = new Date('2026-05-28T08:00:00.000Z');
    type UpdateChatMessageInput = {
      where: { id: string };
      data: {
        metadata: {
          improveRecords: Array<{
            knowledgeBaseId: string;
            documentId: string;
            chunkId: string;
          }>;
        };
      };
    };
    const updateChatMessage = jest
      .fn<Promise<unknown>, [UpdateChatMessageInput]>()
      .mockResolvedValue({
        id: 'message-1',
        sessionId: 'session-1',
        role: ChatMessageRole.ASSISTANT,
        content: 'AI 回答',
        modelId: 'model-1',
        tokenUsage: {},
        metadata: {
          improveRecords: [
            {
              knowledgeBaseId: 'kb-1',
              documentId: 'doc-1',
              documentName: '聊天补充知识',
              chunkId: 'chunk-1',
              chunkTitle: '标题',
              chunkPosition: 0,
              createdAt: updatedAt.toISOString(),
            },
          ],
        },
        createdAt: updatedAt,
        citations: [],
      });
    const prisma = {
      chatMessage: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'message-1',
          role: ChatMessageRole.ASSISTANT,
          metadata: {},
          session: {
            userId: 'user-1',
            agent: {
              agentKnowledgeBases: [{ knowledgeBaseId: 'kb-1' }],
            },
          },
        }),
        update: updateChatMessage,
      },
    };
    knowledgeDocsService.createAiExtractedChunk.mockResolvedValue({
      document: { id: 'doc-1', name: '聊天补充知识' },
      chunk: { id: 'chunk-1', title: '标题', position: 0 },
    });
    const service = createService(prisma);

    const result = await service.improveMessage('message-1', 'user-1', {
      knowledgeBaseId: 'kb-1',
      title: '标题',
      content: '补充内容',
    });

    expect(knowledgeDocsService.createAiExtractedChunk).toHaveBeenCalledWith(
      'kb-1',
      {
        title: '标题',
        content: '补充内容',
        documentId: undefined,
        documentName: undefined,
        sourceMessageId: 'message-1',
      },
    );
    expect(updateChatMessage).toHaveBeenCalledTimes(1);

    const updateInput = updateChatMessage.mock.calls[0]?.[0];

    expect(updateInput?.where).toEqual({ id: 'message-1' });
    expect(updateInput?.data.metadata.improveRecords[0]).toEqual(
      expect.objectContaining({
        knowledgeBaseId: 'kb-1',
        documentId: 'doc-1',
        chunkId: 'chunk-1',
      }),
    );
    expect(result.improveRecord.documentId).toBe('doc-1');
    expect(result.message.improveRecords).toHaveLength(1);
  });

  it('lists improve records with current chunk content', async () => {
    const service = createService({
      chatMessage: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'message-1',
          role: ChatMessageRole.ASSISTANT,
          metadata: {
            improveRecords: [
              {
                knowledgeBaseId: 'kb-1',
                documentId: 'doc-1',
                documentName: '聊天补充知识',
                chunkId: 'chunk-1',
                chunkTitle: '旧标题',
                chunkPosition: 0,
                createdAt: '2026-05-28T08:00:00.000Z',
              },
            ],
          },
          session: {
            userId: 'user-1',
            agent: {
              agentKnowledgeBases: [{ knowledgeBaseId: 'kb-1' }],
            },
          },
        }),
      },
      chunk: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'chunk-1',
            title: '当前标题',
            content: '当前标注内容',
            position: 2,
            document: {
              id: 'doc-1',
              name: '聊天补充知识',
              knowledgeBaseId: 'kb-1',
            },
          },
        ]),
      },
    });

    const records = await service.listImproveRecords('message-1', 'user-1');

    expect(records).toEqual([
      {
        knowledgeBaseId: 'kb-1',
        documentId: 'doc-1',
        documentName: '聊天补充知识',
        chunkId: 'chunk-1',
        chunkTitle: '当前标题',
        chunkPosition: 2,
        content: '当前标注内容',
        createdAt: '2026-05-28T08:00:00.000Z',
      },
    ]);
  });

  it('deletes an improve record and removes its chunk', async () => {
    const updatedAt = new Date('2026-05-28T08:00:00.000Z');
    const existingRecords = [
      {
        knowledgeBaseId: 'kb-1',
        documentId: 'doc-1',
        documentName: '聊天补充知识',
        chunkId: 'chunk-1',
        chunkTitle: '标题 1',
        chunkPosition: 0,
        createdAt: updatedAt.toISOString(),
      },
      {
        knowledgeBaseId: 'kb-1',
        documentId: 'doc-1',
        documentName: '聊天补充知识',
        chunkId: 'chunk-2',
        chunkTitle: '标题 2',
        chunkPosition: 1,
        createdAt: updatedAt.toISOString(),
      },
    ];
    const updateChatMessage = jest.fn().mockResolvedValue({
      id: 'message-1',
      sessionId: 'session-1',
      role: ChatMessageRole.ASSISTANT,
      content: 'AI 回答',
      modelId: 'model-1',
      tokenUsage: {},
      metadata: {
        improveRecords: [existingRecords[1]],
      },
      createdAt: updatedAt,
      citations: [],
    });
    const service = createService({
      chatMessage: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'message-1',
          role: ChatMessageRole.ASSISTANT,
          metadata: {
            improveRecords: existingRecords,
          },
          session: {
            userId: 'user-1',
            agent: {
              agentKnowledgeBases: [{ knowledgeBaseId: 'kb-1' }],
            },
          },
        }),
        update: updateChatMessage,
      },
    });

    const result = await service.removeImproveRecord(
      'message-1',
      'user-1',
      'chunk-1',
    );

    expect(knowledgeDocsService.removeImprovedChunk).toHaveBeenCalledWith(
      'chunk-1',
    );
    expect(updateChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'message-1' },
        data: {
          metadata: {
            improveRecords: [existingRecords[1]],
          },
        },
      }),
    );
    expect(result.deletedRecord.chunkId).toBe('chunk-1');
    expect(result.message.improveRecords).toHaveLength(1);
  });

  it('rejects deleting a missing improve record', async () => {
    const service = createService({
      chatMessage: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'message-1',
          role: ChatMessageRole.ASSISTANT,
          metadata: { improveRecords: [] },
          session: {
            userId: 'user-1',
            agent: {
              agentKnowledgeBases: [{ knowledgeBaseId: 'kb-1' }],
            },
          },
        }),
      },
    });

    await expect(
      service.removeImproveRecord('message-1', 'user-1', 'chunk-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(knowledgeDocsService.removeImprovedChunk).not.toHaveBeenCalled();
  });
});

describe('ChatService chat citations', () => {
  const knowledgeDocsService = {
    createAiExtractedChunk: jest.fn(),
    removeImprovedChunk: jest.fn(),
  };
  const chatModelService = {
    complete: jest.fn(),
    stream: jest.fn(),
  };

  const createService = (
    prisma: Record<string, unknown>,
    retrievalService: Record<string, unknown>,
  ) =>
    new ChatService(
      prisma as never,
      retrievalService as never,
      knowledgeDocsService as never,
      chatModelService as never,
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores only the first three retrieval hits as answer citations', async () => {
    const now = new Date('2026-06-01T10:00:00.000Z');
    type ChatCitationCreateInput = {
      chunk: { connect: { id: string } };
      document: { connect: { id: string } };
      score: number;
      quote: string;
    };
    type ChatMessageCreateInput = {
      data: {
        role: ChatMessageRole;
        citations?: {
          create: ChatCitationCreateInput[];
        };
      };
    };
    const hits = Array.from({ length: 5 }, (_, index) => ({
      chunkId: `chunk-${index + 1}`,
      documentId: `doc-${index + 1}`,
      documentName: `文档 ${index + 1}`,
      title: `标题 ${index + 1}`,
      content: `内容 ${index + 1}`,
      position: index,
      charCount: 10,
      score: 1 - index * 0.1,
      vectorScore: null,
      keywordScore: null,
      finalScore: 1 - index * 0.1,
      matchReason: 'SEMANTIC',
      rerankScore: null,
    }));
    const chatMessageCreate = jest
      .fn<Promise<unknown>, [ChatMessageCreateInput]>()
      .mockImplementation(({ data }: { data: { role: ChatMessageRole } }) => {
        if (data.role === ChatMessageRole.USER) {
          return Promise.resolve({
            id: 'message-user',
            sessionId: 'session-1',
            role: ChatMessageRole.USER,
            content: '线段树是什么',
            modelId: null,
            tokenUsage: {},
            metadata: {},
            createdAt: now,
            citations: [],
          });
        }

        return Promise.resolve({
          id: 'message-assistant',
          sessionId: 'session-1',
          role: ChatMessageRole.ASSISTANT,
          content: '回答内容',
          modelId: 'model-1',
          tokenUsage: {},
          metadata: {},
          createdAt: now,
          citations: [],
        });
      });
    const prisma = {
      agent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'agent-1',
          name: 'OI 助手',
          status: 'PUBLISHED',
          systemPrompt: '你是知识库助手。',
          temperature: null,
          topP: null,
          model: {
            id: 'model-1',
            type: 'CHAT',
            isEnabled: true,
            modelName: 'qwen',
            baseUrl: 'https://example.test/v1',
            apiKey: 'secret',
          },
          agentKnowledgeBases: [{ knowledgeBaseId: 'kb-1' }],
        }),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            chatSession: {
              create: jest.fn().mockResolvedValue({
                id: 'session-1',
                userId: 'user-1',
                agentId: 'agent-1',
                title: '线段树是什么',
                createdAt: now,
                updatedAt: now,
                agent: {
                  id: 'agent-1',
                  name: 'OI 助手',
                },
              }),
            },
            chatMessage: {
              create: chatMessageCreate,
            },
          }),
        ),
      ),
    };
    const retrievalService = {
      retrieveFromKnowledgeBases: jest.fn().mockResolvedValue({
        question: '线段树是什么',
        topK: 5,
        hits,
      }),
    };

    chatModelService.complete.mockResolvedValue({
      content: '回答内容',
      usage: {},
    });

    const service = createService(prisma, retrievalService);

    await service.chat('agent-1', 'user-1', {
      message: '线段树是什么',
      topK: 5,
    });

    const createdCitations =
      chatMessageCreate.mock.calls[1]?.[0].data.citations?.create ?? [];

    expect(createdCitations).toHaveLength(3);
    expect(
      createdCitations.map((citation) => citation.chunk.connect.id),
    ).toEqual(['chunk-1', 'chunk-2', 'chunk-3']);
  });

  it('maps streamed LangChain deltas to existing chat stream events', async () => {
    async function* answerDeltas() {
      await Promise.resolve();
      yield '第一段';
      yield '第二段';
    }

    const now = new Date('2026-06-01T10:00:00.000Z');
    const chatMessageCreate = jest
      .fn()
      .mockImplementation(({ data }: { data: { role: ChatMessageRole } }) => {
        if (data.role === ChatMessageRole.USER) {
          return Promise.resolve({
            id: 'message-user',
            sessionId: 'session-1',
            role: ChatMessageRole.USER,
            content: '线段树是什么',
            modelId: null,
            tokenUsage: {},
            metadata: {},
            createdAt: now,
            citations: [],
          });
        }

        return Promise.resolve({
          id: 'message-assistant',
          sessionId: 'session-1',
          role: ChatMessageRole.ASSISTANT,
          content: '第一段第二段',
          modelId: 'model-1',
          tokenUsage: {},
          metadata: {},
          createdAt: now,
          citations: [],
        });
      });
    const prisma = {
      agent: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'agent-1',
          name: 'OI 助手',
          status: 'PUBLISHED',
          systemPrompt: '你是知识库助手。',
          temperature: null,
          topP: null,
          model: {
            id: 'model-1',
            type: 'CHAT',
            isEnabled: true,
            modelName: 'qwen',
            baseUrl: 'https://example.test/v1',
            apiKey: 'secret',
          },
          agentKnowledgeBases: [{ knowledgeBaseId: 'kb-1' }],
        }),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            chatSession: {
              create: jest.fn().mockResolvedValue({
                id: 'session-1',
                userId: 'user-1',
                agentId: 'agent-1',
                title: '线段树是什么',
                createdAt: now,
                updatedAt: now,
                agent: {
                  id: 'agent-1',
                  name: 'OI 助手',
                },
              }),
            },
            chatMessage: {
              create: chatMessageCreate,
            },
          }),
        ),
      ),
    };
    const retrievalService = {
      retrieveFromKnowledgeBases: jest.fn().mockResolvedValue({
        question: '线段树是什么',
        topK: 5,
        hits: [],
      }),
    };
    const controller = new AbortController();
    chatModelService.stream.mockReturnValue(answerDeltas());
    const service = createService(prisma, retrievalService);

    const events: ChatStreamEvent[] = [];

    for await (const event of service.streamChat(
      'agent-1',
      'user-1',
      { message: '线段树是什么', topK: 5 },
      controller.signal,
    )) {
      events.push(event);
    }

    expect(events[0]).toEqual({
      type: 'delta',
      role: 'assistant',
      content: '第一段',
    });
    expect(events[1]).toEqual({
      type: 'delta',
      role: 'assistant',
      content: '第二段',
    });
    expect(events[2]?.type).toBe('done');

    if (events[2]?.type !== 'done') {
      throw new Error('expected stream to finish with a done event');
    }

    expect(events[2].response.assistantMessage.content).toBe('第一段第二段');
    expect(chatModelService.stream).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: controller.signal,
      }),
    );
  });
});
