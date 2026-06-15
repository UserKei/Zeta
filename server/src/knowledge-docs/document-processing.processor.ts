import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  DOCUMENT_PROCESSING_QUEUE,
  OCR_DOCUMENT_JOB,
  type OcrDocumentJobData,
} from './document-processing.constants';
import { DocumentOcrService } from './document-ocr.service';

@Processor(DOCUMENT_PROCESSING_QUEUE)
export class DocumentProcessingProcessor extends WorkerHost {
  constructor(private readonly documentOcrService: DocumentOcrService) {
    super();
  }

  async process(job: Job<OcrDocumentJobData>) {
    if (job.name !== OCR_DOCUMENT_JOB) {
      return;
    }

    await this.documentOcrService.processDocument(job.data);
  }
}
