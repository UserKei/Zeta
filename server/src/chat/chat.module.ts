import { Module } from '@nestjs/common';
import { RetrievalModule } from '@libs/shared';
import { KnowledgeDocsModule } from '../knowledge-docs/knowledge-docs.module';
import { ChatController } from './chat.controller';
import { ChatModelService } from './chat-model.service';
import { ChatService } from './chat.service';

@Module({
  imports: [RetrievalModule, KnowledgeDocsModule],
  controllers: [ChatController],
  providers: [ChatModelService, ChatService],
})
export class ChatModule {}
