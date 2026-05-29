import { BadRequestException, Injectable } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { ChunkStatus } from '../generated/prisma/enums';
import { TextSplitterService } from '../text-splitter/text-splitter.service';
import type {
  DocumentFileParser,
  FileParseInput,
  FileParseOptions,
  FileParseResult,
} from './parser.types';
import {
  getDocumentNameFromFileName,
  normalizeFileName,
  normalizeTextContent,
} from './parser.utils';

@Injectable()
export class DocxParserService implements DocumentFileParser {
  readonly sourceFormat = 'DOCX' as const;

  constructor(private readonly textSplitter: TextSplitterService) {}

  supports(fileName: string, mimeType?: string | null) {
    return (
      fileName.toLowerCase().endsWith('.docx') ||
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  }

  async parse(
    input: FileParseInput,
    options: FileParseOptions,
  ): Promise<FileParseResult> {
    const fileName = normalizeFileName(input.fileName);
    const documentName = getDocumentNameFromFileName(fileName);
    const content = await this.extractText(input.buffer);

    if (!content) {
      throw new BadRequestException('DOCX 文件没有可解析文本');
    }

    const chunks = this.textSplitter.split(content, {
      maxLength: options.maxChunkLength,
    });

    if (chunks.length === 0) {
      throw new BadRequestException('DOCX 文件无法解析');
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

  private async extractText(buffer: Buffer) {
    try {
      const result = await mammoth.extractRawText({ buffer });

      return normalizeTextContent(result.value);
    } catch {
      throw new BadRequestException('DOCX 文件解析失败');
    }
  }
}
