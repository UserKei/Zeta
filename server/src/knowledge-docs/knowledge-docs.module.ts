import { Module } from '@nestjs/common';
import {
  EmbeddingModule,
  FileStorageModule,
  ImageUnderstandingModule,
  ParserModule,
  RetrievalModule,
} from '@libs/shared';
import { KnowledgeDocsController } from './knowledge-docs.controller';
import { KnowledgeDocsService } from './knowledge-docs.service';

@Module({
  imports: [
    EmbeddingModule,
    FileStorageModule,
    ImageUnderstandingModule,
    ParserModule,
    RetrievalModule,
  ],
  controllers: [KnowledgeDocsController],
  providers: [KnowledgeDocsService],
  exports: [KnowledgeDocsService],
})
export class KnowledgeDocsModule {}
