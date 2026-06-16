import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  DOCUMENT_PROCESSING_QUEUE,
  EMBED_DOCUMENT_JOB,
  type DocumentProcessingJobData,
  type EmbedDocumentJobData,
  IMAGE_UNDERSTANDING_JOB,
  OCR_DOCUMENT_JOB,
  type OcrDocumentJobData,
} from './document-processing.constants';
import { DocumentEmbeddingService } from './document-embedding.service';
import { DocumentImageUnderstandingService } from './document-image-understanding.service';
import { DocumentOcrService } from './document-ocr.service';

@Processor(DOCUMENT_PROCESSING_QUEUE)
export class DocumentProcessingProcessor extends WorkerHost {
  constructor(
    private readonly documentOcrService: DocumentOcrService,
    private readonly documentEmbeddingService: DocumentEmbeddingService,
    private readonly documentImageUnderstandingService: DocumentImageUnderstandingService,
  ) {
    super();
  }

  async process(job: Job<DocumentProcessingJobData>) {
    if (job.name === OCR_DOCUMENT_JOB) {
      await this.documentOcrService.processDocument(
        job.data as OcrDocumentJobData,
      );

      return;
    }

    if (job.name === EMBED_DOCUMENT_JOB) {
      await this.documentEmbeddingService.processDocument(
        job.data as EmbedDocumentJobData,
      );

      return;
    }

    if (job.name === IMAGE_UNDERSTANDING_JOB) {
      await this.documentImageUnderstandingService.processDocument(job.data);
    }
  }
}
