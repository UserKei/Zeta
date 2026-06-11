export const DOCUMENT_PROCESSING_QUEUE = 'document-processing';
export const OCR_DOCUMENT_JOB = 'ocr-document';

export type OcrDocumentJobData = {
  documentId: string;
  knowledgeBaseId: string;
  sourceFileId: string;
};
