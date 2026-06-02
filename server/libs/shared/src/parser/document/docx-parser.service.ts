import { BadRequestException, Injectable } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { HtmlToMarkdownService } from './html-to-markdown.service';
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
} from '../core/parser.utils';

@Injectable()
export class DocxParserService implements DocumentFileParser {
  readonly sourceFormat = 'DOCX' as const;

  constructor(
    private readonly markdownParser: MarkdownParserService,
    private readonly htmlToMarkdown: HtmlToMarkdownService,
  ) {}

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
          styleMap: [
            "p[style-name='Title'] => h1:fresh",
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
            "p[style-name='Heading 4'] => h4:fresh",
            "p[style-name='Heading 5'] => h5:fresh",
            "p[style-name='Heading 6'] => h6:fresh",
            "p[style-name='标题 1'] => h1:fresh",
            "p[style-name='标题 2'] => h2:fresh",
            "p[style-name='标题 3'] => h3:fresh",
            "p[style-name='标题 4'] => h4:fresh",
            "p[style-name='标题 5'] => h5:fresh",
            "p[style-name='标题 6'] => h6:fresh",
          ],
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
        markdown: this.htmlToMarkdown.toMarkdown(result.value),
        assets,
      };
    } catch {
      throw new BadRequestException('DOCX 文件解析失败');
    }
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
