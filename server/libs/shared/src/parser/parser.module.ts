import { Module } from '@nestjs/common';
import { TextSplitterModule } from '../text-splitter/text-splitter.module';
import { FileParserService } from './core/file-parser.service';
import { DocxParserService } from './document/docx-parser.service';
import { HtmlParserService } from './document/html-parser.service';
import { MarkdownParserService } from './document/markdown-parser.service';
import { PdfParserService } from './document/pdf-parser.service';
import { TextParserService } from './document/text-parser.service';
import { SpreadsheetParserService } from './table/spreadsheet-parser.service';

@Module({
  imports: [TextSplitterModule],
  providers: [
    MarkdownParserService,
    TextParserService,
    HtmlParserService,
    PdfParserService,
    DocxParserService,
    SpreadsheetParserService,
    FileParserService,
  ],
  exports: [
    MarkdownParserService,
    TextParserService,
    HtmlParserService,
    PdfParserService,
    DocxParserService,
    SpreadsheetParserService,
    FileParserService,
  ],
})
export class ParserModule {}
