import { Module } from '@nestjs/common';
import { ChatModelService } from './chat-model.service';

@Module({
  providers: [ChatModelService],
  exports: [ChatModelService],
})
export class ChatModelModule {}
