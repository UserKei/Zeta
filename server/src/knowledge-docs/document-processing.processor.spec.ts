jest.mock('./document-ocr.service', () => ({
  DocumentOcrService: class DocumentOcrService {},
}));

jest.mock('./document-embedding.service', () => ({
  DocumentEmbeddingService: class DocumentEmbeddingService {},
}));

jest.mock('./document-image-understanding.service', () => ({
  DocumentImageUnderstandingService: class DocumentImageUnderstandingService {},
}));

import type { Job } from 'bullmq';
import { DocumentProcessingProcessor } from './document-processing.processor';
import {
  EMBED_DOCUMENT_JOB,
  type EmbedDocumentJobData,
  IMAGE_UNDERSTANDING_JOB,
  type ImageUnderstandingJobData,
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
      {} as never,
      {} as never,
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

  it('dispatches embedding document jobs to DocumentEmbeddingService', async () => {
    const documentOcrService = {
      processDocument: jest.fn(),
    };
    const documentEmbeddingService = {
      processDocument: jest.fn().mockResolvedValue(undefined),
    };
    const processor = new DocumentProcessingProcessor(
      documentOcrService as never,
      documentEmbeddingService as never,
      {} as never,
    );
    const jobData: EmbedDocumentJobData = {
      documentId: 'doc-1',
      knowledgeBaseId: 'kb-1',
    };

    await processor.process({
      name: EMBED_DOCUMENT_JOB,
      data: jobData,
    } as Job<EmbedDocumentJobData>);

    expect(documentEmbeddingService.processDocument).toHaveBeenCalledWith(
      jobData,
    );
    expect(documentOcrService.processDocument).not.toHaveBeenCalled();
  });

  it('dispatches image understanding jobs to DocumentImageUnderstandingService', async () => {
    const documentOcrService = {
      processDocument: jest.fn(),
    };
    const documentEmbeddingService = {
      processDocument: jest.fn(),
    };
    const documentImageUnderstandingService = {
      processDocument: jest.fn().mockResolvedValue(undefined),
    };
    const processor = new DocumentProcessingProcessor(
      documentOcrService as never,
      documentEmbeddingService as never,
      documentImageUnderstandingService as never,
    );
    const jobData: ImageUnderstandingJobData = {
      documentId: 'doc-1',
      knowledgeBaseId: 'kb-1',
    };

    await processor.process({
      name: IMAGE_UNDERSTANDING_JOB,
      data: jobData,
    } as Job<ImageUnderstandingJobData>);

    expect(
      documentImageUnderstandingService.processDocument,
    ).toHaveBeenCalledWith(jobData);
    expect(documentEmbeddingService.processDocument).not.toHaveBeenCalled();
    expect(documentOcrService.processDocument).not.toHaveBeenCalled();
  });

  it('ignores unknown document processing jobs', async () => {
    const documentOcrService = {
      processDocument: jest.fn().mockResolvedValue(undefined),
    };
    const processor = new DocumentProcessingProcessor(
      documentOcrService as never,
      {} as never,
      {} as never,
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
