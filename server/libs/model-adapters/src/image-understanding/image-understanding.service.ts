import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { fetchProviderJson } from '../provider-http';

type ImageUnderstandingModelConfig = {
  id: string;
  modelName: string;
  baseUrl: string | null;
  apiKey: string | null;
  configJson: unknown;
};

type ImageUnderstandingInput = {
  dataUrl: string;
  prompt: string;
};

type VisionChatResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

@Injectable()
export class ImageUnderstandingService {
  async understandImage(
    model: ImageUnderstandingModelConfig,
    input: ImageUnderstandingInput,
  ) {
    const baseUrl = model.baseUrl?.trim();
    const apiKey = model.apiKey?.trim();
    const prompt = input.prompt.trim();

    if (!baseUrl || !apiKey) {
      throw new BadRequestException(
        'image understanding model baseUrl and apiKey are required',
      );
    }

    if (!prompt) {
      throw new BadRequestException('image understanding prompt is required');
    }

    const payload = await fetchProviderJson<VisionChatResponse>(
      `${this.trimBaseUrl(baseUrl)}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model.modelName,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: { url: input.dataUrl },
                },
              ],
            },
          ],
        }),
      },
      'image understanding',
    );
    const content = payload.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || !content.trim()) {
      throw new BadGatewayException(
        'image understanding provider returned empty content',
      );
    }

    return content.trim();
  }

  private trimBaseUrl(baseUrl: string) {
    return baseUrl.replace(/\/+$/, '');
  }
}
