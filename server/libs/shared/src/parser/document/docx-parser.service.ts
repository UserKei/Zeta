import { BadRequestException, Injectable } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { MarkdownParserService } from './markdown-parser.service';
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

@Injectable()
export class DocxParserService implements DocumentFileParser {
  readonly sourceFormat = 'DOCX' as const;

  constructor(private readonly markdownParser: MarkdownParserService) {}

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
    const { markdown, assets } = await this.extractMarkdown(input.buffer);

    if (!markdown) {
      throw new BadRequestException('DOCX 文件没有可解析文本');
    }

    const chunks = this.markdownParser.parse(markdown, options);

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
        ...chunk,
        title: chunk.title || documentName,
      })),
      assets,
    };
  }

  private async extractMarkdown(buffer: Buffer) {
    try {
      const assets: FileParseAsset[] = [];
      const result = await mammoth.convertToHtml(
        { buffer },
        {
          convertImage: mammoth.images.imgElement(async (image) => {
            const imageIndex = assets.length + 1;
            const extension = this.getImageExtension(image.contentType);
            const fileName = `image${imageIndex}.${extension}`;
            const reference = `./files/${fileName}`;
            const imageBuffer = await image.readAsBuffer();

            assets.push({
              source: 'DOCX_IMAGE',
              fileName,
              mimeType: image.contentType || 'application/octet-stream',
              reference,
              buffer: imageBuffer,
            });

            return { src: reference };
          }),
        },
      );

      return {
        markdown: this.htmlToMarkdown(result.value),
        assets,
      };
    } catch {
      throw new BadRequestException('DOCX 文件解析失败');
    }
  }

  private htmlToMarkdown(html: string) {
    return normalizeTextContent(
      html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '\n')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '\n')
        .replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (table) =>
          this.tableToMarkdown(table),
        )
        .replace(/<img\b[^>]*>/gi, (image) => this.imageToMarkdown(image))
        .replace(
          /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
          (_match: string, level: string, text: string) =>
            this.headingToMarkdown(Number(level), text),
        )
        .replace(
          /<p\b[^>]*>\s*(?:<a\b[^>]*id=["']heading_\d+["'][^>]*>\s*<\/a>\s*)?<strong>\s*([\s\S]*?)\s*<\/strong>\s*<\/p>/gi,
          (_match: string, text: string) => this.headingToMarkdown(2, text),
        )
        .replace(
          /<li\b[^>]*>([\s\S]*?)<\/li>/gi,
          (_match: string, text: string) => {
            const item = this.toPlainText(text);

            return item ? `\n- ${item}\n` : '\n';
          },
        )
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|section|article|header|footer)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n'),
    );
  }

  private headingToMarkdown(level: number, html: string) {
    const title = this.toPlainText(html);

    if (!title) {
      return '\n';
    }

    const normalizedLevel = Math.min(Math.max(level, 1), 6);

    return `\n${'#'.repeat(normalizedLevel)} ${title}\n`;
  }

  private imageToMarkdown(imageHtml: string) {
    const src = this.getHtmlAttribute(imageHtml, 'src');

    if (!src) {
      return '\n';
    }

    const alt =
      this.getHtmlAttribute(imageHtml, 'alt') || basenameFromPath(src);

    return `\n![${alt}](${src})\n`;
  }

  private tableToMarkdown(tableHtml: string) {
    const rows = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map((row) =>
        [...row[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)]
          .map((cell) => this.escapeTableCell(this.toPlainText(cell[1])))
          .filter((cell) => cell.length > 0),
      )
      .filter((row) => row.length > 0);

    if (rows.length === 0) {
      return '\n';
    }

    const width = Math.max(...rows.map((row) => row.length));
    const normalizedRows = rows.map((row) =>
      Array.from({ length: width }, (_, index) => row[index] ?? ''),
    );
    const [header, ...body] = normalizedRows;
    const separator = Array.from({ length: width }, () => '---');

    return `\n${[header, separator, ...body]
      .map((row) => `| ${row.join(' | ')} |`)
      .join('\n')}\n`;
  }

  private toPlainText(html: string) {
    return this.decodeHtmlEntities(
      html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|section|article)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\s+/g, ' ')
        .trim(),
    );
  }

  private escapeTableCell(value: string) {
    return value.replace(/\|/g, '\\|').replace(/\n+/g, '<br>');
  }

  private decodeHtmlEntities(value: string) {
    return value
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#(\d+);/g, (_match: string, code: string) =>
        String.fromCodePoint(Number(code)),
      )
      .replace(/&#x([\da-f]+);/gi, (_match: string, code: string) =>
        String.fromCodePoint(Number.parseInt(code, 16)),
      );
  }

  private getHtmlAttribute(html: string, name: string) {
    const pattern = new RegExp(`${name}=["']([^"']+)["']`, 'i');
    const value = html.match(pattern)?.[1];

    return value ? this.decodeHtmlEntities(value) : null;
  }

  private getImageExtension(mimeType: string | null | undefined) {
    switch (mimeType) {
      case 'image/jpeg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'image/gif':
        return 'gif';
      case 'image/webp':
        return 'webp';
      case 'image/svg+xml':
        return 'svg';
      default:
        return 'bin';
    }
  }
}

function basenameFromPath(path: string) {
  const [withoutQuery] = path.split('?');
  const [withoutHash] = withoutQuery.split('#');
  const name = withoutHash.split('/').filter(Boolean).at(-1);

  return name || 'image';
}
