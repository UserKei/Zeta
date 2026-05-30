import { BadRequestException, Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { ChunkStatus } from '../../generated/prisma/enums';
import { TextSplitterService } from '../../text-splitter/text-splitter.service';
import type {
  DocumentFileParser,
  FileParseInput,
  FileParseOptions,
  FileParseResult,
} from '../core/parser.types';
import {
  getDocumentNameFromFileName,
  normalizeFileName,
  normalizeTextContent,
} from '../core/parser.utils';

PDFParse.setWorker();

@Injectable()
export class PdfParserService implements DocumentFileParser {
  readonly sourceFormat = 'PDF' as const;

  constructor(private readonly textSplitter: TextSplitterService) {}

  supports(fileName: string, mimeType?: string | null) {
    return (
      fileName.toLowerCase().endsWith('.pdf') || mimeType === 'application/pdf'
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
      throw new BadRequestException('PDF 文件没有可解析文本');
    }

    const chunks = this.textSplitter.split(content, {
      maxLength: options.maxChunkLength,
    });

    if (chunks.length === 0) {
      throw new BadRequestException('PDF 文件无法解析');
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
    const parser = new PDFParse({ data: Uint8Array.from(buffer) });

    try {
      const result = await parser.getText({ pageJoiner: '' });

      return normalizeTextContent(result.text);
    } catch {
      throw new BadRequestException('PDF 文件解析失败');
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }
}
