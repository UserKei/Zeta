import { responseData, serverApi, type Response } from '..'
import type {
  ChunkPayload,
  ChunkUpdatePayload,
  KnowledgeChunk,
  KnowledgeDocument,
  MarkdownParsePayload,
  MarkdownParseResult,
  ManualDocumentPayload,
  RetrievalResult,
  RetrievalTestPayload,
} from '@zeta/common/knowledge-docs'

export type {
  ChunkDraftPayload,
  ChunkPayload,
  ChunkStatus,
  ChunkUpdatePayload,
  DocumentSourceType,
  DocumentStatus,
  KnowledgeChunk,
  KnowledgeDocument,
  MarkdownParsePayload,
  MarkdownParseResult,
  ManualDocumentPayload,
  RetrievalHit,
  RetrievalResult,
  RetrievalTestPayload,
} from '@zeta/common/knowledge-docs'

export const listDocuments = (knowledgeBaseId: string) =>
  responseData(
    serverApi.get(`/knowledge-bases/${knowledgeBaseId}/documents`) as Promise<
      Response<KnowledgeDocument[]>
    >,
  )

export const createManualDocument = (
  knowledgeBaseId: string,
  payload: ManualDocumentPayload,
) =>
  responseData(
    serverApi.post(
      `/knowledge-bases/${knowledgeBaseId}/documents/manual`,
      payload,
    ) as Promise<Response<KnowledgeDocument>>,
  )

export const parseMarkdownDocument = (
  knowledgeBaseId: string,
  payload: MarkdownParsePayload,
) =>
  responseData(
    serverApi.post(
      `/knowledge-bases/${knowledgeBaseId}/documents/parse-markdown`,
      payload,
    ) as Promise<Response<MarkdownParseResult>>,
  )

export const listDocumentChunks = (documentId: string) =>
  responseData(
    serverApi.get(`/documents/${documentId}/chunks`) as Promise<
      Response<KnowledgeChunk[]>
    >,
  )

export const createDocumentChunk = (documentId: string, payload: ChunkPayload) =>
  responseData(
    serverApi.post(`/documents/${documentId}/chunks`, payload) as Promise<
      Response<KnowledgeChunk>
    >,
  )

export const updateDocumentChunk = (
  chunkId: string,
  payload: ChunkUpdatePayload,
) =>
  responseData(
    serverApi.patch(`/chunks/${chunkId}`, payload) as Promise<
      Response<KnowledgeChunk>
    >,
  )

export const deleteDocumentChunk = (chunkId: string) =>
  responseData(
    serverApi.delete(`/chunks/${chunkId}`) as Promise<Response<{ id: string }>>,
  )

export const deleteDocument = (documentId: string) =>
  responseData(
    serverApi.delete(`/documents/${documentId}`) as Promise<
      Response<{ id: string }>
    >,
  )

export const testKnowledgeBaseRetrieval = (
  knowledgeBaseId: string,
  payload: RetrievalTestPayload,
) =>
  responseData(
    serverApi.post(
      `/knowledge-bases/${knowledgeBaseId}/retrieval-test`,
      payload,
    ) as Promise<Response<RetrievalResult>>,
  )
