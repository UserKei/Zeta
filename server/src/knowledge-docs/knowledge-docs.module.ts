import { Module } from '@nestjs/common';
import { EmbeddingModule } from '@libs/shared';
import { KnowledgeDocsController } from './knowledge-docs.controller';
import { KnowledgeDocsService } from './knowledge-docs.service';

@Module({
  imports: [EmbeddingModule],
  controllers: [KnowledgeDocsController],
  providers: [KnowledgeDocsService],
})
export class KnowledgeDocsModule {}
