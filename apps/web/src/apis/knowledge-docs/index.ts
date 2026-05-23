import { responseData, serverApi, type Response } from '..'
import type {
  KnowledgeChunk,
  KnowledgeDocument,
  ManualDocumentPayload,
  RetrievalResult,
  RetrievalTestPayload,
} from '@zeta/common/knowledge-docs'

export type {
  ChunkStatus,
  DocumentSourceType,
  DocumentStatus,
  KnowledgeChunk,
  KnowledgeDocument,
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

export const listDocumentChunks = (documentId: string) =>
  responseData(
    serverApi.get(`/documents/${documentId}/chunks`) as Promise<
      Response<KnowledgeChunk[]>
    >,
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
