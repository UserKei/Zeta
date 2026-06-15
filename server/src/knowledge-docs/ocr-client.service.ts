import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type OcrResult = {
  markdown?: string;
  text?: string;
};

const DEFAULT_OCR_REQUEST_TIMEOUT_MS = 600_000;

@Injectable()
export class OcrClientService {
  constructor(private readonly configService: ConfigService) {}

  async recognizePdf(input: { fileName: string; buffer: Buffer }) {
    const baseUrl =
      this.configService.get<string>('OCR_SERVICE_URL') ||
      'http://localhost:8001';
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/ocr/pdf`, {
      method: 'POST',
      headers: {
        'content-type': 'application/pdf',
        'x-file-name': encodeURIComponent(input.fileName),
      },
      body: new Uint8Array(input.buffer),
      signal: AbortSignal.timeout(this.getRequestTimeoutMs()),
    });

    if (!response.ok) {
      throw new Error(`OCR service failed with ${response.status}`);
    }

    const payload = (await response.json()) as OcrResult;

    if (
      (typeof payload.markdown !== 'string' || !payload.markdown.trim()) &&
      (typeof payload.text !== 'string' || !payload.text.trim())
    ) {
      throw new Error('OCR service did not return text');
    }

    return payload;
  }

  private getRequestTimeoutMs() {
    const configured = Number(
      this.configService.get<string>('OCR_REQUEST_TIMEOUT_MS'),
    );

    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_OCR_REQUEST_TIMEOUT_MS;
  }
}
