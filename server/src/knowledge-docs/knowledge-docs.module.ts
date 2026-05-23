import { Module } from '@nestjs/common';
import { EmbeddingModule, RetrievalModule } from '@libs/shared';
import { KnowledgeDocsController } from './knowledge-docs.controller';
import { KnowledgeDocsService } from './knowledge-docs.service';

@Module({
  imports: [EmbeddingModule, RetrievalModule],
  controllers: [KnowledgeDocsController],
  providers: [KnowledgeDocsService],
})
export class KnowledgeDocsModule {}
