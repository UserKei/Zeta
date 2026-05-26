export const DocumentSourceType = {
  FILE_UPLOAD: 'FILE_UPLOAD',
  MANUAL: 'MANUAL',
  AI_EXTRACTED: 'AI_EXTRACTED',
  WEB_IMPORT: 'WEB_IMPORT',
} as const;

export type DocumentSourceType =
  (typeof DocumentSourceType)[keyof typeof DocumentSourceType];

export const DocumentStatus = {
  UPLOADED: 'UPLOADED',
  PARSING: 'PARSING',
  CHUNKING: 'CHUNKING',
  EMBEDDING: 'EMBEDDING',
  INDEXED: 'INDEXED',
  FAILED: 'FAILED',
  DISABLED: 'DISABLED',
} as const;

export type DocumentStatus =
  (typeof DocumentStatus)[keyof typeof DocumentStatus];

export const ChunkStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
} as const;

export type ChunkStatus = (typeof ChunkStatus)[keyof typeof ChunkStatus];

export type KnowledgeDocument = {
  id: string;
  knowledgeBaseId: string;
  sourceFileId: string | null;
  name: string;
  description: string | null;
  sourceType: DocumentSourceType;
  status: DocumentStatus;
  charCount: number;
  chunkCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeChunk = {
  id: string;
  knowledgeBaseId: string;
  documentId: string;
  title: string | null;
  content: string;
  position: number;
  tokenCount: number | null;
  charCount: number;
  status: ChunkStatus;
  createdAt: string;
  updatedAt: string;
};

export type ChunkDraftPayload = {
  title?: string | null;
  content: string;
  status?: ChunkStatus;
};

export type ManualDocumentPayload = {
  name: string;
  description?: string;
  chunks: ChunkDraftPayload[];
};

export type MarkdownImportPayload = {
  name: string;
  description?: string;
  chunks: ChunkDraftPayload[];
};

export type DocumentUpdatePayload = {
  name?: string;
  description?: string | null;
};

export type MarkdownPreviewResult = {
  fileName: string;
  documentName: string;
  chunks: ChunkDraftPayload[];
};

export type ChunkPayload = {
  title?: string | null;
  content: string;
  status?: ChunkStatus;
  afterChunkId?: string | null;
};

export type ChunkUpdatePayload = {
  title?: string | null;
  content?: string;
  status?: ChunkStatus;
};

export type ChunkReorderPayload = {
  chunkIds: string[];
};

export type RetrievalTestPayload = {
  question: string;
  topK?: number;
};

export type RetrievalMatchReason = 'VECTOR' | 'KEYWORD' | 'HYBRID';

export type RetrievalHit = {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  position: number;
  charCount: number;
  score: number;
  vectorScore: number | null;
  keywordScore: number | null;
  finalScore: number;
  matchReason: RetrievalMatchReason;
};

export type RetrievalResult = {
  question: string;
  topK: number;
  hits: RetrievalHit[];
};
