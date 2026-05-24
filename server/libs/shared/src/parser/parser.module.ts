import { Module } from '@nestjs/common';
import { TextSplitterModule } from '../text-splitter/text-splitter.module';
import { MarkdownParserService } from './markdown-parser.service';

@Module({
  imports: [TextSplitterModule],
  providers: [MarkdownParserService],
  exports: [MarkdownParserService],
})
export class ParserModule {}
