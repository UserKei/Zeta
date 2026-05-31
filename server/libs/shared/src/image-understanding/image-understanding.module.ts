import { Module } from '@nestjs/common';
import { ImageUnderstandingService } from './image-understanding.service';

@Module({
  providers: [ImageUnderstandingService],
  exports: [ImageUnderstandingService],
})
export class ImageUnderstandingModule {}
