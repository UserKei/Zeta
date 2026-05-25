import { Module } from '@nestjs/common';
import {
  EmbeddingModule,
  FileStorageModule,
  ParserModule,
  RetrievalModule,
} from '@libs/shared';
import { KnowledgeDocsController } from './knowledge-docs.controller';
import { KnowledgeDocsService } from './knowledge-docs.service';

@Module({
  imports: [EmbeddingModule, FileStorageModule, ParserModule, RetrievalModule],
  controllers: [KnowledgeDocsController],
  providers: [KnowledgeDocsService],
})
export class KnowledgeDocsModule {}
