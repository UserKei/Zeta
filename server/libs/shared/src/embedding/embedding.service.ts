import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@libs/shared/generated/prisma/client';

type EmbeddingModelConfig = {
  id: string;
  modelName: string;
  baseUrl: string | null;
  apiKey: string | null;
  configJson: Prisma.JsonValue;
};

type EmbeddingResponse = {
  data?: Array<{
    index?: number;
    embedding?: unknown;
  }>;
};

type JsonRecord = Record<string, unknown>;

const MAX_BATCH_SIZE = 10;

@Injectable()
export class EmbeddingService {
  async embedTexts(model: EmbeddingModelConfig, texts: string[]) {
    if (texts.length === 0) {
      return [];
    }

    const { baseUrl, apiKey } = model;

    if (!baseUrl || !apiKey) {
      throw new BadRequestException(
        'embedding model baseUrl and apiKey are required',
      );
    }

    const embeddings: number[][] = [];

    for (let start = 0; start < texts.length; start += MAX_BATCH_SIZE) {
      const batch = texts.slice(start, start + MAX_BATCH_SIZE);
      embeddings.push(
        ...(await this.embedBatch(model, batch, baseUrl, apiKey)),
      );
    }

    return embeddings;
  }

  private async embedBatch(
    model: EmbeddingModelConfig,
    texts: string[],
    baseUrl: string,
    apiKey: string,
  ) {
    const response = await fetch(`${this.trimBaseUrl(baseUrl)}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model.modelName,
        input: texts,
        dimensions: this.getDimensions(model.configJson),
        encoding_format: this.getEncodingFormat(model.configJson),
      }),
    });

    if (!response.ok) {
      const message = await response.text();

      throw new BadGatewayException(
        `embedding provider request failed: ${message || response.statusText}`,
      );
    }

    const payload = (await response.json()) as EmbeddingResponse;
    const data = payload.data ?? [];

    if (data.length !== texts.length) {
      throw new BadGatewayException('embedding provider returned invalid data');
    }

    return data
      .slice()
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
      .map((item) => this.parseEmbedding(item.embedding));
  }

  private parseEmbedding(value: unknown) {
    if (!Array.isArray(value) || value.length === 0) {
      throw new BadGatewayException(
        'embedding provider returned invalid vector',
      );
    }

    const embedding: number[] = [];

    for (const item of value) {
      if (typeof item !== 'number' || !Number.isFinite(item)) {
        throw new BadGatewayException(
          'embedding provider returned invalid vector',
        );
      }

      embedding.push(item);
    }

    return embedding;
  }

  private trimBaseUrl(baseUrl: string) {
    return baseUrl.replace(/\/+$/, '');
  }

  private getDimensions(configJson: Prisma.JsonValue) {
    const config = this.getJsonRecord(configJson);
    const dimensions = config?.dimensions;

    return typeof dimensions === 'number' ? dimensions : undefined;
  }

  private getEncodingFormat(configJson: Prisma.JsonValue) {
    const config = this.getJsonRecord(configJson);
    const encodingFormat = config?.encodingFormat;

    return typeof encodingFormat === 'string' ? encodingFormat : 'float';
  }

  private getJsonRecord(configJson: Prisma.JsonValue): JsonRecord | null {
    if (
      configJson &&
      typeof configJson === 'object' &&
      !Array.isArray(configJson)
    ) {
      return configJson;
    }

    return null;
  }
}
