import { Module } from '@nestjs/common';
import {
  EmbeddingModule,
  ImageUnderstandingModule,
} from '@libs/model-adapters';
import { FileStorageModule, ParserModule, RetrievalModule } from '@libs/shared';
import { ChunkIndexingService } from './chunk-indexing.service';
import { DocumentAssetService } from './document-asset.service';
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
  providers: [ChunkIndexingService, DocumentAssetService, KnowledgeDocsService],
  exports: [KnowledgeDocsService],
})
export class KnowledgeDocsModule {}
