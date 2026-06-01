import { responseData, serverApi, type Response } from '..'
import type { KnowledgeUsageRange, KnowledgeUsageSummary } from '@zeta/common/knowledge-bases'

export type { KnowledgeUsageRange, KnowledgeUsageSummary } from '@zeta/common/knowledge-bases'

export type KnowledgeBaseStatus = 'ACTIVE' | 'DISABLED'

export type KnowledgeBase = {
  id: string
  name: string
  description: string | null
  status: KnowledgeBaseStatus
  embeddingModelId: string | null
  visionModelId: string | null
  rerankerModelId: string | null
  chunkSize: number
  chunkOverlap: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  embeddingModel: {
    id: string
    name: string
    provider: string
    modelName: string
    isEnabled: boolean
  } | null
  visionModel: {
    id: string
    name: string
    provider: string
    modelName: string
    isEnabled: boolean
  } | null
  rerankerModel: {
    id: string
    name: string
    provider: string
    modelName: string
    isEnabled: boolean
  } | null
}

export type KnowledgeBasePayload = {
  name: string
  description?: string | null
  status: KnowledgeBaseStatus
  embeddingModelId: string
  visionModelId?: string | null
  rerankerModelId?: string | null
  imageUnderstandingPrompt?: string | null
  chunkSize: number
  chunkOverlap: number
}

export const listKnowledgeBases = () =>
  responseData(serverApi.get('/knowledge-bases') as Promise<Response<KnowledgeBase[]>>)

export const getKnowledgeBase = (id: string) =>
  responseData(serverApi.get(`/knowledge-bases/${id}`) as Promise<Response<KnowledgeBase>>)

export const createKnowledgeBase = (payload: KnowledgeBasePayload) =>
  responseData(serverApi.post('/knowledge-bases', payload) as Promise<Response<KnowledgeBase>>)

export const updateKnowledgeBase = (id: string, payload: Partial<KnowledgeBasePayload>) =>
  responseData(
    serverApi.patch(`/knowledge-bases/${id}`, payload) as Promise<Response<KnowledgeBase>>,
  )

export const deleteKnowledgeBase = (id: string) =>
  responseData(serverApi.delete(`/knowledge-bases/${id}`) as Promise<Response<{ id: string }>>)

export const getKnowledgeBaseUsage = (id: string, range: KnowledgeUsageRange) =>
  responseData(
    serverApi.get(`/knowledge-bases/${id}/usage`, {
      params: { range },
    }) as Promise<Response<KnowledgeUsageSummary>>,
  )
