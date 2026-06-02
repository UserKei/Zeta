import { BadGatewayException } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';

type TestEmbeddingInput = {
  text?: string;
  image?: {
    dataUrl: string;
  };
};

describe('EmbeddingService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses OpenAI-compatible embeddings by default', async () => {
    const fetchMock = mockSuccessfulFetch({
      data: [{ index: 0, embedding: [0.1, 0.2] }],
    });

    const service = new EmbeddingService();
    const result = await service.embedTexts(
      createModel({
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        configJson: {
          protocol: 'openai-compatible',
          dimensions: 1024,
        },
      }),
      ['VPN 权限'],
    );

    expect(result).toEqual([[0.1, 0.2]]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings',
      expect.objectContaining({
        body: JSON.stringify({
          model: 'text-embedding-v4',
          input: ['VPN 权限'],
          dimensions: 1024,
          encoding_format: 'float',
        }),
      }),
    );
  });

  it('uses DashScope multimodal endpoint for text queries when configured', async () => {
    const fetchMock = mockSuccessfulFetch({
      output: {
        embeddings: [{ embedding: [0.3, 0.4] }],
      },
    });

    const service = new EmbeddingService();
    const result = await service.embedTexts(
      createModel({
        modelName: 'qwen3-vl-embedding',
        baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
        configJson: {
          protocol: 'dashscope-multimodal',
          dimension: 1024,
          enableFusion: true,
        },
      }),
      ['VPN 流程图'],
    );

    expect(result).toEqual([[0.3, 0.4]]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding',
      expect.objectContaining({
        body: JSON.stringify({
          model: 'qwen3-vl-embedding',
          input: {
            contents: [{ text: 'VPN 流程图' }],
          },
          parameters: {
            dimension: 1024,
            enable_fusion: true,
          },
        }),
      }),
    );
  });

  it('embeds image inputs through DashScope multimodal endpoint', async () => {
    const fetchMock = mockSuccessfulFetch({
      output: {
        embeddings: [{ embedding: [0.5, 0.6] }],
      },
    });

    const service = new EmbeddingService() as EmbeddingService & {
      embedInputs: (
        model: Parameters<EmbeddingService['embedTexts']>[0],
        inputs: TestEmbeddingInput[],
      ) => Promise<number[][]>;
    };
    const result = await service.embedInputs(
      createModel({
        modelName: 'qwen3-vl-embedding',
        baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
        configJson: {
          protocol: 'dashscope-multimodal',
          dimension: 1024,
        },
      }),
      [
        {
          text: '扫描件 第 1 页',
          image: {
            dataUrl: 'data:image/png;base64,aGVsbG8=',
          },
        },
      ],
    );

    expect(result).toEqual([[0.5, 0.6]]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding',
      expect.objectContaining({
        body: JSON.stringify({
          model: 'qwen3-vl-embedding',
          input: {
            contents: [
              { text: '扫描件 第 1 页' },
              { image: 'data:image/png;base64,aGVsbG8=' },
            ],
          },
          parameters: {
            dimension: 1024,
          },
        }),
      }),
    );
  });

  it('wraps provider network failures as BadGatewayException', async () => {
    global.fetch = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockRejectedValue(new Error('connection refused'));

    const service = new EmbeddingService();

    await expect(
      service.embedTexts(createModel({}), ['VPN 权限']),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('wraps invalid provider JSON as BadGatewayException', async () => {
    global.fetch = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      } as Response);

    const service = new EmbeddingService();

    await expect(
      service.embedTexts(createModel({}), ['VPN 权限']),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});

function mockSuccessfulFetch(payload: unknown) {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(payload),
      } as Response),
  );
  global.fetch = fetchMock;

  return fetchMock;
}

function createModel(input: {
  modelName?: string;
  baseUrl?: string;
  configJson?: unknown;
}) {
  return {
    id: 'model-id',
    modelName: input.modelName ?? 'text-embedding-v4',
    baseUrl: input.baseUrl ?? 'https://example.test/v1',
    apiKey: 'test-key',
    configJson: input.configJson ?? {},
  };
}
