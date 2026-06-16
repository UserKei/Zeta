import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  DOCUMENT_PROCESSING_QUEUE,
  EMBED_DOCUMENT_JOB,
  type DocumentProcessingJobData,
  type EmbedDocumentJobData,
  IMAGE_UNDERSTANDING_JOB,
  type ImageUnderstandingJobData,
  OCR_DOCUMENT_JOB,
  type OcrDocumentJobData,
} from './document-processing.constants';

@Injectable()
export class DocumentProcessingJobService {
  constructor(
    @InjectQueue(DOCUMENT_PROCESSING_QUEUE)
    private readonly documentProcessingQueue: Queue<DocumentProcessingJobData>,
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

  async enqueueDocumentEmbedding(data: EmbedDocumentJobData) {
    await this.documentProcessingQueue.add(EMBED_DOCUMENT_JOB, data, {
      jobId: `${EMBED_DOCUMENT_JOB}:${data.documentId}:${data.requestedAt}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: true,
      removeOnFail: 500,
    });
  }

  async enqueueImageUnderstanding(data: ImageUnderstandingJobData) {
    await this.documentProcessingQueue.add(IMAGE_UNDERSTANDING_JOB, data, {
      jobId: `${IMAGE_UNDERSTANDING_JOB}:${data.documentId}`,
      attempts: 2,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: true,
      removeOnFail: 500,
    });
  }
}
