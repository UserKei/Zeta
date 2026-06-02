import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { fetchProviderJson } from '../provider-http';

type RerankModelConfig = {
  id: string;
  modelName: string;
  baseUrl: string | null;
  apiKey: string | null;
  configJson: unknown;
};

type RerankInput = {
  query: string;
  documents: string[];
  topN: number;
};

type RerankProviderResponse = {
  results?: Array<{
    index?: unknown;
    relevance_score?: unknown;
    score?: unknown;
  }>;
};

export type RerankResult = {
  index: number;
  score: number;
};

@Injectable()
export class RerankService {
  async rerankDocuments(
    model: RerankModelConfig,
    input: RerankInput,
  ): Promise<RerankResult[]> {
    if (input.documents.length === 0) {
      return [];
    }

    const baseUrl = model.baseUrl?.trim();
    const apiKey = model.apiKey?.trim();

    if (!baseUrl || !apiKey) {
      throw new BadRequestException(
        'reranker model baseUrl and apiKey are required',
      );
    }

    const body: Record<string, unknown> = {
      model: model.modelName,
      query: input.query,
      documents: input.documents,
      top_n: input.topN,
    };
    const instruct = this.getInstruct(model.configJson);

    if (instruct) {
      body.instruct = instruct;
    }

    const payload = await fetchProviderJson<RerankProviderResponse>(
      `${this.trimBaseUrl(baseUrl)}/reranks`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      'rerank',
    );

    return this.parseResults(payload.results, input.documents.length);
  }

  private parseResults(
    results: RerankProviderResponse['results'],
    documentCount: number,
  ) {
    if (!Array.isArray(results)) {
      throw new BadGatewayException('rerank provider returned invalid data');
    }

    return results.map((item) => {
      const index = item.index;
      const score = item.relevance_score ?? item.score;

      if (
        typeof index !== 'number' ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= documentCount ||
        typeof score !== 'number' ||
        !Number.isFinite(score)
      ) {
        throw new BadGatewayException('rerank provider returned invalid data');
      }

      return {
        index,
        score: this.normalizeScore(score),
      };
    });
  }

  private normalizeScore(score: number) {
    return Math.min(Math.max(score, 0), 1);
  }

  private getInstruct(configJson: unknown) {
    if (
      !configJson ||
      typeof configJson !== 'object' ||
      Array.isArray(configJson)
    ) {
      return null;
    }

    const instruct = (configJson as Record<string, unknown>).instruct;

    return typeof instruct === 'string' && instruct.trim()
      ? instruct.trim()
      : null;
  }

  private trimBaseUrl(baseUrl: string) {
    return baseUrl.replace(/\/+$/, '');
  }
}
