import { BadGatewayException, Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseMessageLike, MessageContent } from '@langchain/core/messages';

export type ChatModelRequest = {
  apiKey?: string | null;
  baseUrl?: string | null;
  modelName: string;
  temperature: number;
  topP?: number;
  messages: readonly BaseMessageLike[];
  signal?: AbortSignal;
};

export type ChatModelResponse = {
  content: string;
  usage: unknown;
};

@Injectable()
export class ChatModelService {
  async complete(input: ChatModelRequest): Promise<ChatModelResponse> {
    const model = this.createClient(input, false);

    try {
      const response = await model.invoke([...input.messages], {
        ...(input.signal ? { signal: input.signal } : {}),
      });
      const content = this.extractContent(response.content).trim();

      if (!content) {
        throw new BadGatewayException('chat provider returned empty answer');
      }

      return {
        content,
        usage: this.extractUsage(response),
      };
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new BadGatewayException(
        `chat provider request failed: ${this.toErrorMessage(error)}`,
      );
    }
  }

  async *stream(input: ChatModelRequest): AsyncGenerator<string> {
    const model = this.createClient(input, true);

    try {
      const stream = await model.stream([...input.messages], {
        ...(input.signal ? { signal: input.signal } : {}),
      });

      for await (const chunk of stream) {
        const content = this.extractContent(chunk.content);

        if (content) {
          yield content;
        }
      }
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new BadGatewayException(
        `chat provider request failed: ${this.toErrorMessage(error)}`,
      );
    }
  }

  private createClient(input: ChatModelRequest, streaming: boolean) {
    return new ChatOpenAI({
      apiKey: input.apiKey ?? undefined,
      model: input.modelName,
      temperature: input.temperature,
      topP: input.topP,
      streaming,
      configuration: input.baseUrl
        ? { baseURL: this.trimBaseUrl(input.baseUrl) }
        : undefined,
    });
  }

  private extractContent(content: MessageContent) {
    if (typeof content === 'string') {
      return content;
    }

    return content
      .map((block) => {
        if (block.type === 'text' && typeof block.text === 'string') {
          return block.text;
        }

        return '';
      })
      .join('');
  }

  private extractUsage(response: { usage_metadata?: unknown }) {
    return response.usage_metadata ?? {};
  }

  private trimBaseUrl(baseUrl: string) {
    return baseUrl.replace(/\/+$/, '');
  }

  private toErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return String(error);
  }
}
