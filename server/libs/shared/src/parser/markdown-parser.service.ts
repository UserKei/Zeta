import { BadRequestException, Injectable } from '@nestjs/common';
import type { ChunkDraftPayload } from '@zeta/common/knowledge-docs';
import { TextSplitterService } from '../text-splitter/text-splitter.service';
import type {
  DocumentFileParser,
  FileParseInput,
  FileParseOptions,
  FileParseResult,
  MarkdownParseOptions,
} from './parser.types';
import {
  getDocumentNameFromFileName,
  normalizeFileName,
  normalizeTextContent,
} from './parser.utils';

type Heading = {
  level: number;
  title: string;
};

@Injectable()
export class MarkdownParserService implements DocumentFileParser {
  readonly sourceFormat = 'MARKDOWN' as const;

  constructor(private readonly textSplitter: TextSplitterService) {}

  supports(fileName: string, mimeType?: string | null) {
    const lowerFileName = fileName.toLowerCase();

    return (
      lowerFileName.endsWith('.md') ||
      lowerFileName.endsWith('.markdown') ||
      mimeType === 'text/markdown'
    );
  }

  parse(content: string, options: MarkdownParseOptions): ChunkDraftPayload[];
  parse(input: FileParseInput, options: FileParseOptions): FileParseResult;
  parse(
    contentOrInput: string | FileParseInput,
    options: MarkdownParseOptions | FileParseOptions,
  ): ChunkDraftPayload[] | FileParseResult {
    if (typeof contentOrInput === 'string') {
      return this.parseContent(contentOrInput, options);
    }

    const fileName = normalizeFileName(contentOrInput.fileName);

    return {
      fileName,
      documentName: getDocumentNameFromFileName(fileName),
      sourceFormat: this.sourceFormat,
      chunks: this.parseContent(
        contentOrInput.buffer.toString('utf8'),
        options,
      ),
    };
  }

  private parseContent(content: string, options: MarkdownParseOptions) {
    const text = this.stripLeadingFrontmatter(
      normalizeTextContent(content),
    ).trim();
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

      if (body) {
        for (const contentPart of this.textSplitter.split(body, {
          maxLength: options.maxChunkLength,
        })) {
          chunks.push({
            title,
            content: contentPart,
            status: 'ACTIVE',
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

  private stripLeadingFrontmatter(text: string) {
    return text.replace(/^---[^\S\n]*\n[\s\S]*?\n---[^\S\n]*(?:\n|$)/, '');
  }
}
