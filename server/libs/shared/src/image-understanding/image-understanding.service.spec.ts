import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { ImageUnderstandingService } from './image-understanding.service';

describe('ImageUnderstandingService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends image and prompt to an OpenAI-compatible vision chat endpoint', async () => {
    const fetchMock = jest.mocked(global.fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: '图片中包含 VPN 审批流程，要求部门负责人审批。',
              },
            },
          ],
        }),
    } as Response);

    const service = new ImageUnderstandingService();
    const result = await service.understandImage(
      {
        id: 'model-1',
        modelName: 'qwen-vl-max',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/',
        apiKey: 'sk-test',
        configJson: {},
      },
      {
        dataUrl: 'data:image/png;base64,aGVsbG8=',
        prompt: '先提取图片中的文字，再总结业务信息。',
      },
    );

    expect(result).toBe('图片中包含 VPN 审批流程，要求部门负责人审批。');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'qwen-vl-max',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: '先提取图片中的文字，再总结业务信息。' },
                {
                  type: 'image_url',
                  image_url: { url: 'data:image/png;base64,aGVsbG8=' },
                },
              ],
            },
          ],
        }),
      }),
    );
  });

  it('rejects image understanding models without baseUrl or apiKey', async () => {
    const service = new ImageUnderstandingService();

    await expect(
      service.understandImage(
        {
          id: 'model-1',
          modelName: 'qwen-vl-max',
          baseUrl: null,
          apiKey: null,
          configJson: {},
        },
        {
          dataUrl: 'data:image/png;base64,aGVsbG8=',
          prompt: '描述图片',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when the provider returns an empty answer', async () => {
    const fetchMock = jest.mocked(global.fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ choices: [{ message: { content: '   ' } }] }),
    } as Response);

    const service = new ImageUnderstandingService();

    await expect(
      service.understandImage(
        {
          id: 'model-1',
          modelName: 'qwen-vl-max',
          baseUrl: 'https://example.com/v1',
          apiKey: 'sk-test',
          configJson: {},
        },
        {
          dataUrl: 'data:image/png;base64,aGVsbG8=',
          prompt: '描述图片',
        },
      ),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
