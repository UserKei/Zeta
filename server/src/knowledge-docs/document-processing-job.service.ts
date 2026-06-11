import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  DOCUMENT_PROCESSING_QUEUE,
  OCR_DOCUMENT_JOB,
  type OcrDocumentJobData,
} from './document-processing.constants';

@Injectable()
export class DocumentProcessingJobService {
  constructor(
    @InjectQueue(DOCUMENT_PROCESSING_QUEUE)
    private readonly documentProcessingQueue: Queue<OcrDocumentJobData>,
  ) {}

  async enqueueOcrDocument(data: OcrDocumentJobData) {
    await this.documentProcessingQueue.add(OCR_DOCUMENT_JOB, data, {
      jobId: `${OCR_DOCUMENT_JOB}:${data.documentId}`,
      attempts: 2,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }
}
