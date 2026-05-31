export const KnowledgeBaseStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
} as const;

export type KnowledgeBaseStatus =
  (typeof KnowledgeBaseStatus)[keyof typeof KnowledgeBaseStatus];

export type KnowledgeBasePayload = {
  name: string;
  description?: string | null;
  status?: KnowledgeBaseStatus;
  embeddingModelId: string;
  visionModelId?: string | null;
  imageUnderstandingPrompt?: string | null;
  chunkSize?: number;
  chunkOverlap?: number;
};

export type KnowledgeBaseUpdatePayload = Partial<KnowledgeBasePayload>;

export type KnowledgeUsageRange = '7d' | '30d' | 'all';

export type KnowledgeUsageDocumentItem = {
  documentId: string;
  documentName: string;
  sourceType: string;
  citationCount: number;
  citedChunkCount: number;
  lastCitedAt: string;
};

export type KnowledgeUsageChunkItem = {
  chunkId: string;
  documentId: string;
  documentName: string;
  chunkPosition: number;
  title: string | null;
  preview: string;
  citationCount: number;
  lastCitedAt: string;
};

export type KnowledgeUsageSummary = {
  range: KnowledgeUsageRange;
  totalCitations: number;
  citedDocumentCount: number;
  citedChunkCount: number;
  lastCitedAt: string | null;
  topDocuments: KnowledgeUsageDocumentItem[];
  topChunks: KnowledgeUsageChunkItem[];
};
