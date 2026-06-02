import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { fetchProviderJson } from '../provider-http';

type EmbeddingModelConfig = {
  id: string;
  modelName: string;
  baseUrl: string | null;
  apiKey: string | null;
  configJson: unknown;
};

type EmbeddingResponse = {
  data?: Array<{
    index?: number;
    embedding?: unknown;
  }>;
};

export type EmbeddingInput = {
  text?: string;
  image?: {
    dataUrl: string;
  };
};

type DashScopeMultimodalResponse = {
  output?: {
    embeddings?: Array<{
      embedding?: unknown;
    }>;
  };
};

type JsonRecord = Record<string, unknown>;

const MAX_BATCH_SIZE = 10;
const DASHSCOPE_MULTIMODAL_ENDPOINT =
  '/services/embeddings/multimodal-embedding/multimodal-embedding';

@Injectable()
export class EmbeddingService {
  async embedTexts(
    model: EmbeddingModelConfig,
    texts: string[],
  ): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    if (this.isDashScopeMultimodalModel(model.configJson)) {
      return this.embedInputs(
        model,
        texts.map((text) => ({ text })),
      );
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

  async embedInputs(
    model: EmbeddingModelConfig,
    inputs: EmbeddingInput[],
  ): Promise<number[][]> {
    if (inputs.length === 0) {
      return [];
    }

    if (!this.isDashScopeMultimodalModel(model.configJson)) {
      if (inputs.some((input) => input.image)) {
        throw new BadRequestException(
          'image embedding requires a multimodal embedding model',
        );
      }

      return this.embedTexts(
        model,
        inputs.map((input) => input.text?.trim() ?? ''),
      );
    }

    const { baseUrl, apiKey } = model;

    if (!baseUrl || !apiKey) {
      throw new BadRequestException(
        'embedding model baseUrl and apiKey are required',
      );
    }

    const embeddings: number[][] = [];

    for (const input of inputs) {
      embeddings.push(
        await this.embedDashScopeMultimodalInput(model, input, baseUrl, apiKey),
      );
    }

    return embeddings;
  }

  private async embedBatch(
    model: EmbeddingModelConfig,
    texts: string[],
    baseUrl: string,
    apiKey: string,
  ): Promise<number[][]> {
    const payload = await fetchProviderJson<EmbeddingResponse>(
      `${this.trimBaseUrl(baseUrl)}/embeddings`,
      {
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
      },
      'embedding',
    );
    const data = payload.data ?? [];

    if (data.length !== texts.length) {
      throw new BadGatewayException('embedding provider returned invalid data');
    }

    return data
      .slice()
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
      .map((item) => this.parseEmbedding(item.embedding));
  }

  private async embedDashScopeMultimodalInput(
    model: EmbeddingModelConfig,
    input: EmbeddingInput,
    baseUrl: string,
    apiKey: string,
  ): Promise<number[]> {
    const contents = this.toDashScopeContents(input);

    if (contents.length === 0) {
      throw new BadRequestException('embedding input is required');
    }

    const payload = await fetchProviderJson<DashScopeMultimodalResponse>(
      this.getDashScopeMultimodalUrl(baseUrl, model.configJson),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model.modelName,
          input: {
            contents,
          },
          parameters: this.getDashScopeParameters(model.configJson),
        }),
      },
      'embedding',
    );
    const embedding = payload.output?.embeddings?.[0]?.embedding;

    return this.parseEmbedding(embedding);
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

  private getDimensions(configJson: unknown) {
    const config = this.getJsonRecord(configJson);
    const dimensions = config?.dimensions;

    return typeof dimensions === 'number' ? dimensions : undefined;
  }

  private getEncodingFormat(configJson: unknown) {
    const config = this.getJsonRecord(configJson);
    const encodingFormat = config?.encodingFormat;

    return typeof encodingFormat === 'string' ? encodingFormat : 'float';
  }

  private isDashScopeMultimodalModel(configJson: unknown) {
    const config = this.getJsonRecord(configJson);

    return config?.protocol === 'dashscope-multimodal';
  }

  private getDashScopeMultimodalUrl(baseUrl: string, configJson: unknown) {
    const config = this.getJsonRecord(configJson);
    const endpoint = config?.multimodalEndpoint;

    if (typeof endpoint === 'string' && endpoint.trim()) {
      const normalizedEndpoint = endpoint.trim();

      if (/^https?:\/\//i.test(normalizedEndpoint)) {
        return normalizedEndpoint.replace(/\/+$/, '');
      }

      return `${this.trimBaseUrl(baseUrl)}/${normalizedEndpoint.replace(/^\/+/, '')}`;
    }

    const normalizedBaseUrl = this.trimBaseUrl(baseUrl).replace(
      /\/compatible-mode\/v1$/,
      '/api/v1',
    );

    if (normalizedBaseUrl.endsWith(DASHSCOPE_MULTIMODAL_ENDPOINT)) {
      return normalizedBaseUrl;
    }

    return `${normalizedBaseUrl}${DASHSCOPE_MULTIMODAL_ENDPOINT}`;
  }

  private toDashScopeContents(input: EmbeddingInput) {
    const contents: Array<Record<string, string>> = [];
    const text = input.text?.trim();

    if (text) {
      contents.push({ text });
    }

    if (input.image?.dataUrl) {
      contents.push({ image: input.image.dataUrl });
    }

    return contents;
  }

  private getDashScopeParameters(configJson: unknown) {
    const config = this.getJsonRecord(configJson);
    const dimension =
      typeof config?.dimension === 'number'
        ? config.dimension
        : this.getDimensions(configJson);
    const enableFusion = config?.enableFusion;
    const parameters: JsonRecord = {};

    if (typeof dimension === 'number') {
      parameters.dimension = dimension;
    }

    if (typeof enableFusion === 'boolean') {
      parameters.enable_fusion = enableFusion;
    }

    return parameters;
  }

  private getJsonRecord(configJson: unknown): JsonRecord | null {
    if (
      configJson &&
      typeof configJson === 'object' &&
      !Array.isArray(configJson)
    ) {
      return configJson as JsonRecord;
    }

    return null;
  }
}
