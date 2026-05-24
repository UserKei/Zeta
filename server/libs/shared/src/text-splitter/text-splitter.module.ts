import { Module } from '@nestjs/common';
import { TextSplitterService } from './text-splitter.service';

@Module({
  providers: [TextSplitterService],
  exports: [TextSplitterService],
})
export class TextSplitterModule {}
