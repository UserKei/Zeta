import { responseData, serverApi, type Response } from '..'

export type KnowledgeBaseStatus = 'ACTIVE' | 'DISABLED'

export type KnowledgeBase = {
  id: string
  name: string
  description: string | null
  status: KnowledgeBaseStatus
  embeddingModelId: string
  chunkSize: number
  chunkOverlap: number
  createdAt: string
  updatedAt: string
  embeddingModel: {
    id: string
    name: string
    provider: string
    modelName: string
    isEnabled: boolean
  }
}

export type KnowledgeBasePayload = {
  name: string
  description?: string
  status: KnowledgeBaseStatus
  embeddingModelId: string
  chunkSize: number
  chunkOverlap: number
}

export const listKnowledgeBases = () =>
  responseData(
    serverApi.get('/knowledge-bases') as Promise<Response<KnowledgeBase[]>>,
  )

export const getKnowledgeBase = (id: string) =>
  responseData(
    serverApi.get(`/knowledge-bases/${id}`) as Promise<Response<KnowledgeBase>>,
  )

export const createKnowledgeBase = (payload: KnowledgeBasePayload) =>
  responseData(
    serverApi.post('/knowledge-bases', payload) as Promise<
      Response<KnowledgeBase>
    >,
  )

export const updateKnowledgeBase = (
  id: string,
  payload: Partial<KnowledgeBasePayload>,
) =>
  responseData(
    serverApi.patch(`/knowledge-bases/${id}`, payload) as Promise<
      Response<KnowledgeBase>
    >,
  )

export const deleteKnowledgeBase = (id: string) =>
  responseData(
    serverApi.delete(`/knowledge-bases/${id}`) as Promise<
      Response<{ id: string }>
    >,
  )
