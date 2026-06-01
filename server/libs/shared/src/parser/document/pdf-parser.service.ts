import { BadRequestException, Injectable } from '@nestjs/common';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { PDFParse } from 'pdf-parse';
import { ChunkStatus } from '../../generated/prisma/enums';
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
import { MarkdownParserService } from './markdown-parser.service';

PDFParse.setWorker();

const PDF_SCREENSHOT_PAGE_LIMIT = 10;
const PDF_SCREENSHOT_WIDTH = 1200;
const PDF_LINE_Y_TOLERANCE = 2;
const PDF_LEVEL_TWO_FONT_DIFF = 2;
const PDF_LEVEL_THREE_FONT_DIFF = 0.5;
const PDF_INTERNAL_LINK_PAGE_LIMIT = 5;

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

type PdfLoadingTask = {
  promise: Promise<PDFDocumentProxy>;
  destroy(): Promise<void>;
};

type PdfTextItem = {
  str: string;
  transform: unknown[];
  width: number;
  height: number;
  hasEOL: boolean;
};

type PdfLine = {
  pageNumber: number;
  text: string;
  fontSize: number;
  x: number;
  y: number;
};

type PdfPageText = {
  pageNumber: number;
  lines: PdfLine[];
};

type PdfSectionAnchor = {
  title: string;
  level: number;
  pageNumber: number;
};

type PdfOutlineNode = {
  title: string;
  dest: string | unknown[] | null;
  items?: unknown[];
};

@Injectable()
export class PdfParserService implements DocumentFileParser {
  readonly sourceFormat = 'PDF' as const;

  constructor(private readonly markdownParser: MarkdownParserService) {}

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
    const loaded = await this.loadDocument(input.buffer);
    const { document } = loaded;

    try {
      const pages = await this.extractPageText(document);
      const content = pages
        .flatMap((page) => page.lines.map((line) => line.text))
        .join('\n')
        .trim();

      if (!content) {
        return await this.parseAsPageImages(input.buffer, {
          fileName,
          documentName,
          maxChunkCount: options.maxChunkCount,
        });
      }

      const markdown =
        (await this.buildOutlineMarkdown(document, pages)) ??
        (await this.buildInternalLinkMarkdown(document, pages)) ??
        this.buildFontSizeMarkdown(pages);
      const chunks = this.markdownParser
        .parse(markdown, options)
        .map((chunk) => ({
          ...chunk,
          title: chunk.title || documentName,
          status: ChunkStatus.ACTIVE,
        }));

      return {
        fileName,
        documentName,
        sourceFormat: this.sourceFormat,
        chunks,
      };
    } finally {
      await loaded.destroy().catch(() => undefined);
    }
  }

  private async loadDocument(buffer: Buffer) {
    const pdfjs = await this.loadPdfJs();

    try {
      const loadingTask = pdfjs.getDocument({
        data: Uint8Array.from(buffer),
        disableFontFace: true,
        isOffscreenCanvasSupported: false,
        stopAtErrors: false,
        useWorkerFetch: false,
      }) as unknown as PdfLoadingTask;
      const document = await loadingTask.promise;

      return {
        document,
        destroy: () => loadingTask.destroy(),
      };
    } catch {
      throw new BadRequestException('PDF 文件解析失败');
    }
  }

  private async loadPdfJs(): Promise<PdfJsModule> {
    return import('pdfjs-dist/legacy/build/pdf.mjs');
  }

  private async extractPageText(document: PDFDocumentProxy) {
    const pages: PdfPageText[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);

      pages.push({
        pageNumber,
        lines: await this.extractPageLines(page, pageNumber),
      });
    }

    return pages;
  }

  private async extractPageLines(page: PDFPageProxy, pageNumber: number) {
    try {
      const content = await page.getTextContent();
      const items = (content.items as unknown[])
        .filter((item): item is PdfTextItem => this.isPdfTextItem(item))
        .map((item) => {
          const x = this.readTransformNumber(item.transform, 4);
          const y = this.readTransformNumber(item.transform, 5);
          const fontSize =
            Math.abs(this.readTransformNumber(item.transform, 3)) ||
            item.height;

          return {
            text: item.str.trim(),
            x,
            y,
            width: item.width,
            fontSize,
            hasEOL: item.hasEOL,
          };
        })
        .filter((item) => item.text.length > 0)
        .sort((left, right) => right.y - left.y || left.x - right.x);

      const lines: Array<{
        items: typeof items;
        pageNumber: number;
        y: number;
      }> = [];

      for (const item of items) {
        const line = lines.find(
          (candidate) => Math.abs(candidate.y - item.y) <= PDF_LINE_Y_TOLERANCE,
        );

        if (line) {
          line.items.push(item);
          line.y = (line.y + item.y) / 2;
        } else {
          lines.push({ pageNumber, y: item.y, items: [item] });
        }
      }

      return lines
        .map((line) => {
          const lineItems = line.items.sort((left, right) => left.x - right.x);
          const text = normalizeTextContent(
            this.joinPdfLineItems(lineItems),
          ).trim();
          const fontSize = Math.max(...lineItems.map((item) => item.fontSize));

          return {
            pageNumber: line.pageNumber,
            text,
            fontSize,
            x: lineItems[0]?.x ?? 0,
            y: line.y,
          };
        })
        .filter((line) => line.text.length > 0)
        .sort((left, right) => right.y - left.y || left.x - right.x);
    } catch {
      throw new BadRequestException('PDF 文件解析失败');
    }
  }

  private joinPdfLineItems(
    lineItems: ReadonlyArray<{
      text: string;
      x: number;
      width: number;
      fontSize: number;
    }>,
  ) {
    const [firstItem, ...restItems] = lineItems;

    if (!firstItem) {
      return '';
    }

    let text = firstItem.text;
    let previousItem = firstItem;

    for (const item of restItems) {
      const gap = item.x - (previousItem.x + previousItem.width);
      const spaceThreshold = Math.max(
        1,
        previousItem.fontSize * 0.2,
        item.fontSize * 0.2,
      );

      text += gap > spaceThreshold ? ` ${item.text}` : item.text;
      previousItem = item;
    }

    return text;
  }

  private async buildOutlineMarkdown(
    document: PDFDocumentProxy,
    pages: PdfPageText[],
  ) {
    const outline = await document.getOutline().catch(() => null);

    if (!Array.isArray(outline) || outline.length === 0) {
      return null;
    }

    const anchors = await this.flattenOutline(document, outline, 2);

    return this.buildSectionMarkdown(anchors, pages);
  }

  private async flattenOutline(
    document: PDFDocumentProxy,
    nodes: unknown[],
    level: number,
  ) {
    const anchors: PdfSectionAnchor[] = [];

    for (const node of nodes) {
      if (!this.isOutlineNode(node)) {
        continue;
      }

      const pageNumber = await this.resolveDestinationPageNumber(
        document,
        node.dest,
      );

      if (pageNumber) {
        anchors.push({
          title: node.title,
          level,
          pageNumber,
        });
      }

      if (Array.isArray(node.items) && node.items.length > 0) {
        anchors.push(
          ...(await this.flattenOutline(
            document,
            node.items,
            Math.min(level + 1, 6),
          )),
        );
      }
    }

    return anchors;
  }

  private async buildInternalLinkMarkdown(
    document: PDFDocumentProxy,
    pages: PdfPageText[],
  ) {
    const anchors: PdfSectionAnchor[] = [];
    const pageLimit = Math.min(document.numPages, PDF_INTERNAL_LINK_PAGE_LIMIT);

    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const annotations = await page
        .getAnnotations({ intent: 'display' })
        .catch(() => []);

      for (const annotation of annotations as unknown[]) {
        const dest = this.readRecordValue(annotation, 'dest');
        const targetPageNumber = await this.resolveDestinationPageNumber(
          document,
          dest,
        );

        if (!targetPageNumber || targetPageNumber <= pageNumber) {
          continue;
        }

        anchors.push({
          title:
            pages
              .find((candidate) => candidate.pageNumber === targetPageNumber)
              ?.lines[0]?.text.trim() || `第 ${targetPageNumber} 页`,
          level: 2,
          pageNumber: targetPageNumber,
        });
      }
    }

    return this.buildSectionMarkdown(anchors, pages);
  }

  private buildSectionMarkdown(
    anchors: PdfSectionAnchor[],
    pages: PdfPageText[],
  ) {
    const uniqueAnchors = this.deduplicateAnchors(anchors);

    if (uniqueAnchors.length === 0) {
      return null;
    }

    const maxPageNumber = pages.at(-1)?.pageNumber ?? 1;
    const sections = uniqueAnchors
      .map((anchor, index) => {
        const nextAnchor = uniqueAnchors[index + 1];
        const endPage = nextAnchor
          ? Math.max(anchor.pageNumber, nextAnchor.pageNumber - 1)
          : maxPageNumber;
        const content = pages
          .filter(
            (page) =>
              page.pageNumber >= anchor.pageNumber &&
              page.pageNumber <= endPage,
          )
          .flatMap((page) => page.lines.map((line) => line.text))
          .join('\n')
          .trim();

        if (!content) {
          return null;
        }

        return `${'#'.repeat(anchor.level)} ${anchor.title}\n\n${content}`;
      })
      .filter((section): section is string => Boolean(section));

    return sections.length > 0 ? sections.join('\n\n') : null;
  }

  private buildFontSizeMarkdown(pages: PdfPageText[]) {
    const bodyFontSize = this.getBodyFontSize(
      pages.flatMap((page) => page.lines),
    );

    return pages
      .flatMap((page) =>
        page.lines.map((line) => {
          const fontDiff = line.fontSize - bodyFontSize;

          if (fontDiff > PDF_LEVEL_TWO_FONT_DIFF) {
            return `## ${line.text}`;
          }

          if (fontDiff > PDF_LEVEL_THREE_FONT_DIFF) {
            return `### ${line.text}`;
          }

          return line.text;
        }),
      )
      .join('\n\n');
  }

  private getBodyFontSize(lines: PdfLine[]) {
    const counts = new Map<number, number>();

    for (const line of lines) {
      const rounded = Math.round(line.fontSize * 2) / 2;

      counts.set(rounded, (counts.get(rounded) ?? 0) + 1);
    }

    let bodyFontSize = 0;
    let maxCount = 0;

    for (const [fontSize, count] of counts.entries()) {
      if (count > maxCount || (count === maxCount && fontSize < bodyFontSize)) {
        bodyFontSize = fontSize;
        maxCount = count;
      }
    }

    return bodyFontSize;
  }

  private deduplicateAnchors(anchors: PdfSectionAnchor[]) {
    const seen = new Set<string>();

    return anchors
      .filter((anchor) => anchor.title.trim().length > 0)
      .sort((left, right) => left.pageNumber - right.pageNumber)
      .filter((anchor) => {
        const key = `${anchor.pageNumber}:${anchor.title}`;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);

        return true;
      });
  }

  private async resolveDestinationPageNumber(
    document: PDFDocumentProxy,
    dest: unknown,
  ) {
    const explicitDest =
      typeof dest === 'string'
        ? ((await document.getDestination(dest).catch(() => null)) as unknown)
        : dest;

    if (!Array.isArray(explicitDest)) {
      return null;
    }

    const destination = explicitDest as readonly unknown[];
    const pageRef = destination[0];

    if (!this.isPdfRef(pageRef)) {
      return null;
    }

    const pageIndex = await document.getPageIndex(pageRef).catch(() => null);

    return typeof pageIndex === 'number' ? pageIndex + 1 : null;
  }

  private isPdfTextItem(item: unknown): item is PdfTextItem {
    return (
      this.isRecord(item) &&
      typeof item.str === 'string' &&
      Array.isArray(item.transform) &&
      typeof item.width === 'number' &&
      typeof item.height === 'number' &&
      typeof item.hasEOL === 'boolean'
    );
  }

  private isOutlineNode(node: unknown): node is PdfOutlineNode {
    return (
      this.isRecord(node) &&
      typeof node.title === 'string' &&
      ('dest' in node || 'items' in node)
    );
  }

  private isPdfRef(value: unknown): value is { num: number; gen: number } {
    return (
      this.isRecord(value) &&
      typeof value.num === 'number' &&
      typeof value.gen === 'number'
    );
  }

  private readTransformNumber(transform: unknown[], index: number) {
    const value = transform[index];

    return typeof value === 'number' ? value : 0;
  }

  private readRecordValue(record: unknown, key: string) {
    if (!this.isRecord(record)) {
      return null;
    }

    return record[key];
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
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
