import { BadRequestException, Injectable } from '@nestjs/common';
import { ChunkStatus } from '../../generated/prisma/enums';
import { HtmlToMarkdownService } from './html-to-markdown.service';
import { MarkdownParserService } from './markdown-parser.service';
import type {
  DocumentFileParser,
  FileParseInput,
  FileParseOptions,
  FileParseResult,
} from '../core/parser.types';
import {
  getDocumentNameFromFileName,
  normalizeFileName,
} from '../core/parser.utils';

@Injectable()
export class HtmlParserService implements DocumentFileParser {
  readonly sourceFormat = 'HTML' as const;

  constructor(
    private readonly markdownParser: MarkdownParserService,
    private readonly htmlToMarkdown: HtmlToMarkdownService,
  ) {}

  supports(fileName: string, mimeType?: string | null) {
    const lowerFileName = fileName.toLowerCase();

    return (
      lowerFileName.endsWith('.html') ||
      lowerFileName.endsWith('.htm') ||
      mimeType === 'text/html'
    );
  }

  parse(input: FileParseInput, options: FileParseOptions): FileParseResult {
    const fileName = normalizeFileName(input.fileName);
    const documentName = getDocumentNameFromFileName(fileName);
    const markdown = this.htmlToMarkdown.toMarkdown(
      input.buffer.toString('utf8'),
    );

    if (!markdown) {
      throw new BadRequestException('HTML 文件不能为空');
    }

    const chunks = this.markdownParser.parse(markdown, options);

    if (chunks.length === 0) {
      throw new BadRequestException('HTML 文件无法解析');
    }

    if (chunks.length > options.maxChunkCount) {
      throw new BadRequestException(
        `chunk count cannot exceed ${options.maxChunkCount}`,
      );
    }

    return {
      fileName,
      documentName,
      sourceFormat: this.sourceFormat,
      chunks: chunks.map((chunk) => ({
        ...chunk,
        title: chunk.title || documentName,
        status: ChunkStatus.ACTIVE,
      })),
    };
  }
}
