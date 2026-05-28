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
export class TextParserService implements DocumentFileParser {
  readonly sourceFormat = 'TEXT' as const;

  constructor(private readonly textSplitter: TextSplitterService) {}

  supports(fileName: string, mimeType?: string | null) {
    return fileName.toLowerCase().endsWith('.txt') || mimeType === 'text/plain';
  }

  parse(input: FileParseInput, options: FileParseOptions) {
    const fileName = normalizeFileName(input.fileName);
    const documentName = getDocumentNameFromFileName(fileName);
    const content = normalizeTextContent(input.buffer.toString('utf8'));

    if (!content) {
      throw new BadRequestException('文本文件不能为空');
    }

    const chunks = this.textSplitter.split(content, {
      maxLength: options.maxChunkLength,
    });

    if (chunks.length === 0) {
      throw new BadRequestException('文本文件无法解析');
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
}
