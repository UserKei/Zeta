import { BadRequestException, Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { ChunkStatus } from '../../generated/prisma/enums';
import { TextSplitterService } from '../../text-splitter/text-splitter.service';
import type {
  DocumentFileParser,
  FileParseAsset,
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

const PDF_SCREENSHOT_PAGE_LIMIT = 10;
const PDF_SCREENSHOT_WIDTH = 1200;

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
      return this.parseAsPageImages(input.buffer, {
        fileName,
        documentName,
        maxChunkCount: options.maxChunkCount,
      });
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

  private async parseAsPageImages(
    buffer: Buffer,
    input: {
      fileName: string;
      documentName: string;
      maxChunkCount: number;
    },
  ): Promise<FileParseResult> {
    const pageLimit = Math.min(PDF_SCREENSHOT_PAGE_LIMIT, input.maxChunkCount);
    const { chunks, assets } = await this.renderPageImages(
      buffer,
      input.documentName,
      pageLimit,
    );

    if (chunks.length === 0) {
      throw new BadRequestException('PDF 文件没有可解析文本');
    }

    return {
      fileName: input.fileName,
      documentName: input.documentName,
      sourceFormat: this.sourceFormat,
      chunks,
      assets,
    };
  }

  private async renderPageImages(
    buffer: Buffer,
    documentName: string,
    pageLimit: number,
  ) {
    const parser = new PDFParse({ data: Uint8Array.from(buffer) });

    try {
      const screenshots = await parser.getScreenshot({
        first: pageLimit,
        desiredWidth: PDF_SCREENSHOT_WIDTH,
        imageDataUrl: false,
        imageBuffer: true,
      });
      const assets: FileParseAsset[] = [];
      const chunks: FileParseResult['chunks'] = [];

      for (const page of screenshots.pages) {
        const pageBuffer = Buffer.from(page.data);

        if (pageBuffer.byteLength === 0) {
          continue;
        }

        const fileName = `page-${page.pageNumber}.png`;
        const reference = `./files/${fileName}`;
        const title = `${documentName} / 第 ${page.pageNumber} 页`;

        assets.push({
          source: 'PDF_PAGE_SCREENSHOT',
          fileName,
          mimeType: 'image/png',
          reference,
          buffer: pageBuffer,
        });
        chunks.push({
          title,
          content: `![${documentName} 第 ${page.pageNumber} 页](${reference})`,
          status: ChunkStatus.ACTIVE,
          metadata: {
            contentKind: 'PDF_PAGE_IMAGE',
            assetReference: reference,
            pageNumber: page.pageNumber,
            width: page.width,
            height: page.height,
          },
        });
      }

      return { chunks, assets };
    } catch {
      throw new BadRequestException('PDF 文件解析失败');
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }
}
