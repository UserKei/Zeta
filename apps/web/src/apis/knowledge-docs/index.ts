import { responseData, serverApi, type Response } from '..'
import type {
  ChunkReorderPayload,
  ChunkPayload,
  ChunkUpdatePayload,
  DocumentUpdatePayload,
  KnowledgeChunk,
  KnowledgeDocument,
  MarkdownImportPayload,
  MarkdownPreviewResult,
  ManualDocumentPayload,
  RetrievalResult,
  RetrievalTestPayload,
} from '@zeta/common/knowledge-docs'

export type {
  ChunkDraftPayload,
  ChunkReorderPayload,
  ChunkPayload,
  ChunkStatus,
  ChunkUpdatePayload,
  DocumentUpdatePayload,
  DocumentSourceType,
  DocumentStatus,
  KnowledgeChunk,
  KnowledgeDocument,
  MarkdownImportPayload,
  MarkdownPreviewResult,
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

export const previewMarkdownDocument = (knowledgeBaseId: string, file: File) => {
  const formData = new FormData()
  formData.append('file', file)

  return responseData(
    serverApi.post(
      `/knowledge-bases/${knowledgeBaseId}/documents/markdown/preview`,
      formData,
    ) as Promise<Response<MarkdownPreviewResult>>,
  )
}

export const createMarkdownDocument = (
  knowledgeBaseId: string,
  file: File,
  payload: MarkdownImportPayload,
) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('name', payload.name)
  formData.append('chunks', JSON.stringify(payload.chunks))

  if (payload.description) {
    formData.append('description', payload.description)
  }

  return responseData(
    serverApi.post(
      `/knowledge-bases/${knowledgeBaseId}/documents/markdown`,
      formData,
    ) as Promise<Response<KnowledgeDocument>>,
  )
}

export const listDocumentChunks = (documentId: string) =>
  responseData(
    serverApi.get(`/documents/${documentId}/chunks`) as Promise<
      Response<KnowledgeChunk[]>
    >,
  )

export const getDocument = (documentId: string) =>
  responseData(
    serverApi.get(`/documents/${documentId}`) as Promise<
      Response<KnowledgeDocument>
    >,
  )

export const updateDocument = (
  documentId: string,
  payload: DocumentUpdatePayload,
) =>
  responseData(
    serverApi.patch(`/documents/${documentId}`, payload) as Promise<
      Response<KnowledgeDocument>
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

export const reorderDocumentChunks = (
  documentId: string,
  payload: ChunkReorderPayload,
) =>
  responseData(
    serverApi.patch(
      `/documents/${documentId}/chunks/reorder`,
      payload,
    ) as Promise<Response<KnowledgeChunk[]>>,
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
