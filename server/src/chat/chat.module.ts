import { Module } from '@nestjs/common';
import { ChatModelModule } from '@libs/model-adapters';
import { KnowledgeDocsModule } from '../knowledge-docs/knowledge-docs.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [ChatModelModule, RetrievalModule, KnowledgeDocsModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
