export const DOCUMENT_PROCESSING_QUEUE = 'document-processing';
export const OCR_DOCUMENT_JOB = 'ocr-document';
export const EMBED_DOCUMENT_JOB = 'embed-document';
export const IMAGE_UNDERSTANDING_JOB = 'understand-document-images';

export type OcrDocumentJobData = {
  documentId: string;
  knowledgeBaseId: string;
  sourceFileId: string;
};

export type EmbedDocumentJobData = {
  documentId: string;
  knowledgeBaseId: string;
  requestedAt: string;
};

export type ImageUnderstandingJobData = {
  documentId: string;
  knowledgeBaseId: string;
};

export type DocumentProcessingJobData =
  | OcrDocumentJobData
  | EmbedDocumentJobData
  | ImageUnderstandingJobData;
