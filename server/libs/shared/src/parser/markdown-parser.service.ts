import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ChunkStatus,
  type ChunkDraftPayload,
} from '@zeta/common/knowledge-docs';
import { TextSplitterService } from '../text-splitter/text-splitter.service';
import type { MarkdownParseOptions } from './parser.types';

type Heading = {
  level: number;
  title: string;
};

@Injectable()
export class MarkdownParserService {
  constructor(private readonly textSplitter: TextSplitterService) {}

  parse(content: string, options: MarkdownParseOptions) {
    const text = content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replaceAll('\0', '')
      .trim();
    const chunks: ChunkDraftPayload[] = [];
    const headingStack: Heading[] = [];
    let inCodeBlock = false;
    let buffer: string[] = [];

    const currentTitle = () => {
      const title = headingStack
        .map((heading) => heading.title)
        .join(' ')
        .trim();

      return title || null;
    };

    const flush = () => {
      const title = currentTitle();
      const body = buffer.join('\n').trim();
      const chunkContent = body || title || '';

      if (chunkContent) {
        for (const contentPart of this.textSplitter.split(chunkContent, {
          maxLength: options.maxChunkLength,
        })) {
          chunks.push({
            title,
            content: contentPart,
            status: ChunkStatus.ACTIVE,
          });
        }
      }

      buffer = [];
    };

    for (const line of text.split('\n')) {
      if (this.isFenceLine(line)) {
        buffer.push(line);
        inCodeBlock = !inCodeBlock;
        continue;
      }

      if (inCodeBlock) {
        buffer.push(line);
        continue;
      }

      const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);

      if (!heading) {
        buffer.push(line);
        continue;
      }

      flush();

      const level = heading[1].length;
      const title = heading[2].trim();

      while (
        headingStack.length > 0 &&
        headingStack[headingStack.length - 1].level >= level
      ) {
        headingStack.pop();
      }

      headingStack.push({ level, title });
    }

    flush();

    if (chunks.length === 0) {
      throw new BadRequestException('markdown content cannot be parsed');
    }

    if (chunks.length > options.maxChunkCount) {
      throw new BadRequestException(
        `chunk count cannot exceed ${options.maxChunkCount}`,
      );
    }

    return chunks;
  }

  private isFenceLine(line: string) {
    return /^\s*(```|~~~)/.test(line);
  }
}
