import { Module } from '@nestjs/common';
import {
  EmbeddingModule,
  ImageUnderstandingModule,
} from '@libs/model-adapters';
import { FileStorageModule, ParserModule } from '@libs/shared';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { AiExtractedDocumentService } from './ai-extracted-document.service';
import { ChunkIndexingService } from './chunk-indexing.service';
import { DocumentAssetService } from './document-asset.service';
import { DocumentImportService } from './document-import.service';
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
  providers: [
    AiExtractedDocumentService,
    ChunkIndexingService,
    DocumentAssetService,
    DocumentImportService,
    KnowledgeDocsService,
  ],
  exports: [AiExtractedDocumentService, KnowledgeDocsService],
})
export class KnowledgeDocsModule {}
