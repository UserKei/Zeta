import { DocumentProcessingJobService } from './document-processing-job.service';
import { OCR_DOCUMENT_JOB } from './document-processing.constants';

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
        jobId: `${OCR_DOCUMENT_JOB}:doc-1`,
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
  });
});
