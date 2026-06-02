import { BadGatewayException } from '@nestjs/common';

const mockInvoke = jest.fn();
const mockStream = jest.fn();

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: mockInvoke,
    stream: mockStream,
  })),
}));

import { ChatOpenAI } from '@langchain/openai';
import { ChatModelService } from './chat-model.service';

const baseRequest = {
  apiKey: 'secret',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/',
  modelName: 'qwen-plus',
  temperature: 0.3,
  topP: 0.8,
  messages: [
    ['system', '你是知识库助手。'],
    ['human', '线段树是什么'],
  ] as const,
};

describe('ChatModelService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invokes ChatOpenAI with OpenAI-compatible configuration', async () => {
    mockInvoke.mockResolvedValue({ content: '回答内容', usage_metadata: {} });
    const service = new ChatModelService();

    const result = await service.complete(baseRequest);

    expect(ChatOpenAI).toHaveBeenCalledWith({
      apiKey: 'secret',
      model: 'qwen-plus',
      temperature: 0.3,
      topP: 0.8,
      streaming: false,
      configuration: {
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      },
    });
    expect(mockInvoke).toHaveBeenCalledWith(baseRequest.messages, {});
    expect(result).toEqual({ content: '回答内容', usage: {} });
  });

  it('extracts answer text from text content blocks', async () => {
    mockInvoke.mockResolvedValue({
      content: [
        { type: 'text', text: '第一段' },
        { type: 'text', text: '第二段' },
      ],
      usage_metadata: { input_tokens: 10 },
    });
    const service = new ChatModelService();

    const result = await service.complete(baseRequest);

    expect(result).toEqual({
      content: '第一段第二段',
      usage: { input_tokens: 10 },
    });
  });

  it('rejects empty answers', async () => {
    mockInvoke.mockResolvedValue({ content: '  ' });
    const service = new ChatModelService();

    await expect(service.complete(baseRequest)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('streams text chunks and forwards abort signal', async () => {
    async function* chunks() {
      await Promise.resolve();
      yield { content: '第一段' };
      yield { content: [{ type: 'text', text: '第二段' }] };
    }

    const controller = new AbortController();
    mockStream.mockResolvedValue(chunks());
    const service = new ChatModelService();
    const deltas: string[] = [];

    for await (const delta of service.stream({
      ...baseRequest,
      signal: controller.signal,
    })) {
      deltas.push(delta);
    }

    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ streaming: true }),
    );
    expect(mockStream).toHaveBeenCalledWith(baseRequest.messages, {
      signal: controller.signal,
    });
    expect(deltas).toEqual(['第一段', '第二段']);
  });
});
