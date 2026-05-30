import { BadRequestException, Injectable } from '@nestjs/common';
import { DocxParserService } from '../document/docx-parser.service';
import { HtmlParserService } from '../document/html-parser.service';
import { MarkdownParserService } from '../document/markdown-parser.service';
import { PdfParserService } from '../document/pdf-parser.service';
import { TextParserService } from '../document/text-parser.service';
import { SpreadsheetParserService } from '../table/spreadsheet-parser.service';
import type {
  DocumentFileParser,
  FileParseInput,
  FileParseOptions,
} from './parser.types';
import { DEFAULT_FILE_PARSE_OPTIONS } from './parser.types';
import { normalizeFileName } from './parser.utils';

@Injectable()
export class FileParserService {
  constructor(
    markdownParser: MarkdownParserService,
    textParser: TextParserService,
    htmlParser: HtmlParserService,
    pdfParser: PdfParserService,
    docxParser: DocxParserService,
    spreadsheetParser: SpreadsheetParserService,
  ) {
    this.parsers = [
      markdownParser,
      textParser,
      htmlParser,
      pdfParser,
      docxParser,
      spreadsheetParser,
    ];
  }

  private readonly parsers: DocumentFileParser[];

  async parse(input: FileParseInput, options: Partial<FileParseOptions> = {}) {
    const fileName = normalizeFileName(input.fileName);
    const parser = this.findParser(fileName, input.mimeType);

    return await parser.parse(
      { ...input, fileName },
      { ...DEFAULT_FILE_PARSE_OPTIONS, ...options },
    );
  }

  private findParser(fileName: string, mimeType?: string | null) {
    const parser = this.parsers.find((candidate) =>
      candidate.supports(fileName, mimeType),
    );

    if (!parser) {
      throw new BadRequestException('暂不支持该文件类型');
    }

    return parser;
  }
}
