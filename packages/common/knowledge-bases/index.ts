import type { PageResult } from "../pagination";

export const KnowledgeBaseStatus = {
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
} as const;

export type KnowledgeBaseStatus =
  (typeof KnowledgeBaseStatus)[keyof typeof KnowledgeBaseStatus];

export type KnowledgeBasePayload = {
  name: string;
  description?: string | null;
  status?: KnowledgeBaseStatus;
  embeddingModelId: string;
  visionModelId?: string | null;
  rerankerModelId?: string | null;
  imageUnderstandingPrompt?: string | null;
  chunkSize?: number;
  chunkOverlap?: number;
};

export type KnowledgeBaseUpdatePayload = Partial<KnowledgeBasePayload>;

export type KnowledgeBaseModelSummary = {
  id: string;
  name: string;
  provider: string;
  modelName: string;
  isEnabled: boolean;
};

export type KnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
  status: KnowledgeBaseStatus;
  embeddingModelId: string | null;
  visionModelId: string | null;
  rerankerModelId: string | null;
  chunkSize: number;
  chunkOverlap: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  embeddingModel: KnowledgeBaseModelSummary | null;
  visionModel: KnowledgeBaseModelSummary | null;
  rerankerModel: KnowledgeBaseModelSummary | null;
};

export type KnowledgeUsageRange = "7d" | "30d" | "all";

export type KnowledgeUsageDocumentItem = {
  documentId: string;
  documentName: string;
  sourceType: string;
  citationCount: number;
  chunkCount: number;
  citedChunkCount: number;
  chunkCoverageRate: number;
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
  totalChunkCount: number;
  citedDocumentCount: number;
  citedChunkCount: number;
  chunkCoverageRate: number;
  lastCitedAt: string | null;
  topDocuments: PageResult<KnowledgeUsageDocumentItem>;
  topChunks: PageResult<KnowledgeUsageChunkItem>;
};

export type KnowledgeUsageQuery = {
  range?: KnowledgeUsageRange;
  documentPage?: number;
  documentPageSize?: number;
  chunkPage?: number;
  chunkPageSize?: number;
};
