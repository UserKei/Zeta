jest.mock('./document-ocr.service', () => ({
  DocumentOcrService: class DocumentOcrService {},
}));

import type { Job } from 'bullmq';
import { DocumentProcessingProcessor } from './document-processing.processor';
import {
  OCR_DOCUMENT_JOB,
  type OcrDocumentJobData,
} from './document-processing.constants';

describe('DocumentProcessingProcessor', () => {
  it('dispatches OCR document jobs to DocumentOcrService', async () => {
    const documentOcrService = {
      processDocument: jest.fn().mockResolvedValue(undefined),
    };
    const processor = new DocumentProcessingProcessor(
      documentOcrService as never,
    );
    const jobData: OcrDocumentJobData = {
      documentId: 'doc-1',
      knowledgeBaseId: 'kb-1',
      sourceFileId: 'file-1',
    };

    await processor.process({
      name: OCR_DOCUMENT_JOB,
      data: jobData,
    } as Job<OcrDocumentJobData>);

    expect(documentOcrService.processDocument).toHaveBeenCalledWith(jobData);
  });

  it('ignores unknown document processing jobs', async () => {
    const documentOcrService = {
      processDocument: jest.fn().mockResolvedValue(undefined),
    };
    const processor = new DocumentProcessingProcessor(
      documentOcrService as never,
    );

    await processor.process({
      name: 'unknown-job',
      data: {
        documentId: 'doc-1',
        knowledgeBaseId: 'kb-1',
        sourceFileId: 'file-1',
      },
    } as Job<OcrDocumentJobData>);

    expect(documentOcrService.processDocument).not.toHaveBeenCalled();
  });
});
