import { DocumentProcessingJobService } from './document-processing-job.service';
import {
  EMBED_DOCUMENT_JOB,
  IMAGE_UNDERSTANDING_JOB,
  OCR_DOCUMENT_JOB,
} from './document-processing.constants';

describe('DocumentProcessingJobService', () => {
  it('enqueues OCR document jobs with stable id and retry policy', async () => {
    const queue = {
      add: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DocumentProcessingJobService(queue as never);

    await service.enqueueOcrDocument({
      documentId: 'doc-1',
      knowledgeBaseId: 'kb-1',
      sourceFileId: 'file-1',
    });

    expect(queue.add).toHaveBeenCalledWith(
      OCR_DOCUMENT_JOB,
      {
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
        sourceFileId: 'file-1',
      },
      {
        jobId: `${OCR_DOCUMENT_JOB}__doc-1`,
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
  });

  it('enqueues embedding document jobs with request-versioned id and retry policy', async () => {
    const queue = {
      add: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DocumentProcessingJobService(queue as never);
    const requestedAt = '2026-06-16T10:00:00.000Z';

    await service.enqueueDocumentEmbedding({
      documentId: 'doc-1',
      knowledgeBaseId: 'kb-1',
      requestedAt,
    });

    expect(queue.add).toHaveBeenCalledWith(
      EMBED_DOCUMENT_JOB,
      {
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
        requestedAt,
      },
      {
        jobId: `${EMBED_DOCUMENT_JOB}__doc-1__2026-06-16T10-00-00.000Z`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: true,
        removeOnFail: 500,
      },
    );
  });

  it('enqueues image understanding jobs with stable id and retry policy', async () => {
    const queue = {
      add: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DocumentProcessingJobService(queue as never);

    await service.enqueueImageUnderstanding({
      documentId: 'doc-1',
      knowledgeBaseId: 'kb-1',
    });

    expect(queue.add).toHaveBeenCalledWith(
      IMAGE_UNDERSTANDING_JOB,
      {
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
      },
      {
        jobId: `${IMAGE_UNDERSTANDING_JOB}__doc-1`,
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: true,
        removeOnFail: 500,
      },
    );
  });
});
