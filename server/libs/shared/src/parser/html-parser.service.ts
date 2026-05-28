import { BadRequestException, Injectable } from '@nestjs/common';
import { ChunkStatus } from '@zeta/common/knowledge-docs';
import { TextSplitterService } from '../text-splitter/text-splitter.service';
import type {
  DocumentFileParser,
  FileParseInput,
  FileParseOptions,
} from './parser.types';
import {
  getDocumentNameFromFileName,
  normalizeFileName,
  normalizeTextContent,
} from './parser.utils';

@Injectable()
export class HtmlParserService implements DocumentFileParser {
  readonly sourceFormat = 'HTML' as const;

  constructor(private readonly textSplitter: TextSplitterService) {}

  supports(fileName: string, mimeType?: string | null) {
    const lowerFileName = fileName.toLowerCase();

    return (
      lowerFileName.endsWith('.html') ||
      lowerFileName.endsWith('.htm') ||
      mimeType === 'text/html'
    );
  }

  parse(input: FileParseInput, options: FileParseOptions) {
    const fileName = normalizeFileName(input.fileName);
    const documentName = getDocumentNameFromFileName(fileName);
    const content = this.extractText(input.buffer.toString('utf8'));

    if (!content) {
      throw new BadRequestException('HTML 文件不能为空');
    }

    const chunks = this.textSplitter.split(content, {
      maxLength: options.maxChunkLength,
    });

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
        title: documentName,
        content: chunk,
        status: ChunkStatus.ACTIVE,
      })),
    };
  }

  private extractText(content: string) {
    return normalizeTextContent(
      content
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '\n')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(
          /<\/(p|div|section|article|header|footer|h[1-6]|li|tr)>/gi,
          '\n',
        )
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{2,}/g, '\n'),
    );
  }
}
