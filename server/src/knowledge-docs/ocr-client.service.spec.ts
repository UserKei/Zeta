import { OcrClientService } from './ocr-client.service';

describe('OcrClientService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts PDF bytes to the OCR service and returns markdown', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ markdown: '# OCR result' }),
    } as never);
    const configService = {
      get: jest.fn().mockReturnValue('http://ocr:8001/'),
    };
    const service = new OcrClientService(configService as never);

    const result = await service.recognizePdf({
      fileName: '扫描件.pdf',
      buffer: Buffer.from('pdf-bytes'),
    });

    expect(result).toEqual({ markdown: '# OCR result' });
    expect(fetchSpy).toHaveBeenCalledWith('http://ocr:8001/ocr/pdf', {
      method: 'POST',
      headers: {
        'content-type': 'application/pdf',
        'x-file-name': '%E6%89%AB%E6%8F%8F%E4%BB%B6.pdf',
      },
      body: new Uint8Array(Buffer.from('pdf-bytes')),
      signal: expect.anything() as AbortSignal,
    });
  });

  it('uses a configurable request timeout', async () => {
    const timeoutSignal = new AbortController().signal;
    const timeoutSpy = jest
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(timeoutSignal);
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ markdown: '# OCR result' }),
    } as never);
    const configService = {
      get: jest.fn((key: string) =>
        key === 'OCR_REQUEST_TIMEOUT_MS' ? '1234' : 'http://ocr:8001',
      ),
    };
    const service = new OcrClientService(configService as never);

    await service.recognizePdf({
      fileName: '扫描件.pdf',
      buffer: Buffer.from('pdf-bytes'),
    });

    expect(timeoutSpy).toHaveBeenCalledWith(1234);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://ocr:8001/ocr/pdf',
      expect.objectContaining({ signal: timeoutSignal }),
    );
  });

  it('fails when the OCR service returns an error response', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: jest.fn(),
    } as never);
    const configService = {
      get: jest.fn().mockReturnValue('http://ocr:8001'),
    };
    const service = new OcrClientService(configService as never);

    await expect(
      service.recognizePdf({
        fileName: '扫描件.pdf',
        buffer: Buffer.from('pdf-bytes'),
      }),
    ).rejects.toThrow('OCR service failed with 503');
  });

  it('fails when the OCR service returns no text', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ markdown: '  ' }),
    } as never);
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    };
    const service = new OcrClientService(configService as never);

    await expect(
      service.recognizePdf({
        fileName: '扫描件.pdf',
        buffer: Buffer.from('pdf-bytes'),
      }),
    ).rejects.toThrow('OCR service did not return text');
  });
});
