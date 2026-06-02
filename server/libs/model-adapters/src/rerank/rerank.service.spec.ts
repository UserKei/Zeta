import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { RerankService } from './rerank.service';

describe('RerankService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends candidates to an OpenAI-compatible rerank endpoint', async () => {
    const fetchMock = jest.mocked(global.fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            { index: 1, relevance_score: 0.91 },
            { index: 0, relevance_score: 0.48 },
          ],
        }),
    } as Response);

    const service = new RerankService();
    const result = await service.rerankDocuments(
      {
        id: 'model-1',
        modelName: 'qwen3-rerank',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-api/v1/',
        apiKey: 'sk-test',
        configJson: {
          instruct: 'Retrieve semantically similar text.',
        },
      },
      {
        query: '如何修改密码？',
        documents: [
          '点击设置 > 安全 > 修改密码即可更新凭据',
          '忘记密码怎么办？',
        ],
        topN: 2,
      },
    );

    expect(result).toEqual([
      { index: 1, score: 0.91 },
      { index: 0, score: 0.48 },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://dashscope.aliyuncs.com/compatible-api/v1/reranks',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'qwen3-rerank',
          query: '如何修改密码？',
          documents: [
            '点击设置 > 安全 > 修改密码即可更新凭据',
            '忘记密码怎么办？',
          ],
          top_n: 2,
          instruct: 'Retrieve semantically similar text.',
        }),
      }),
    );
  });

  it('rejects rerank models without baseUrl or apiKey', async () => {
    const service = new RerankService();

    await expect(
      service.rerankDocuments(
        {
          id: 'model-1',
          modelName: 'qwen3-rerank',
          baseUrl: null,
          apiKey: null,
          configJson: {},
        },
        {
          query: 'VPN',
          documents: ['VPN 需要审批'],
          topN: 1,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when the provider returns invalid result indexes', async () => {
    const fetchMock = jest.mocked(global.fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [{ index: 3, relevance_score: 0.9 }],
        }),
    } as Response);

    const service = new RerankService();

    await expect(
      service.rerankDocuments(
        {
          id: 'model-1',
          modelName: 'qwen3-rerank',
          baseUrl: 'https://example.com/v1',
          apiKey: 'sk-test',
          configJson: {},
        },
        {
          query: 'VPN',
          documents: ['VPN 需要审批'],
          topN: 1,
        },
      ),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
