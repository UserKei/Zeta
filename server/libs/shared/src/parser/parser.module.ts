import { Module } from '@nestjs/common';
import { TextSplitterModule } from '../text-splitter/text-splitter.module';
import { DocxParserService } from './docx-parser.service';
import { FileParserService } from './file-parser.service';
import { HtmlParserService } from './html-parser.service';
import { MarkdownParserService } from './markdown-parser.service';
import { PdfParserService } from './pdf-parser.service';
import { SpreadsheetParserService } from './spreadsheet-parser.service';
import { TextParserService } from './text-parser.service';

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
