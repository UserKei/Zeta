import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import {
  EmbeddingModule,
  ImageUnderstandingModule,
} from '@libs/model-adapters';
import { FileStorageModule, ParserModule } from '@libs/shared';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { AiExtractedDocumentService } from './ai-extracted-document.service';
import { ChunkIndexingService } from './chunk-indexing.service';
import { DocumentEmbeddingService } from './document-embedding.service';
import { DocumentImageUnderstandingService } from './document-image-understanding.service';
import { DocumentAssetService } from './document-asset.service';
import { DocumentImportService } from './document-import.service';
import { DocumentOcrService } from './document-ocr.service';
import { DocumentProcessingProcessor } from './document-processing.processor';
import { DocumentProcessingJobService } from './document-processing-job.service';
import { DOCUMENT_PROCESSING_QUEUE } from './document-processing.constants';
import { KnowledgeDocsController } from './knowledge-docs.controller';
import { KnowledgeDocsService } from './knowledge-docs.service';
import { OcrClientService } from './ocr-client.service';

@Module({
  imports: [
    EmbeddingModule,
    FileStorageModule,
    BullModule.registerQueue({
      name: DOCUMENT_PROCESSING_QUEUE,
    }),
    ImageUnderstandingModule,
    ParserModule,
    RetrievalModule,
  ],
  controllers: [KnowledgeDocsController],
  providers: [
    AiExtractedDocumentService,
    ChunkIndexingService,
    DocumentEmbeddingService,
    DocumentImageUnderstandingService,
    DocumentAssetService,
    DocumentImportService,
    DocumentOcrService,
    DocumentProcessingProcessor,
    DocumentProcessingJobService,
    KnowledgeDocsService,
    OcrClientService,
  ],
  exports: [AiExtractedDocumentService, KnowledgeDocsService],
})
export class KnowledgeDocsModule {}
