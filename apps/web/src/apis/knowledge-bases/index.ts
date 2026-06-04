import { responseData, serverApi, type Response } from '..'
import type {
  KnowledgeBase,
  KnowledgeBasePayload,
  KnowledgeBaseUpdatePayload,
  KnowledgeUsageRange,
  KnowledgeUsageSummary,
} from '@zeta/common/knowledge-bases'

export type {
  KnowledgeBase,
  KnowledgeBasePayload,
  KnowledgeBaseStatus,
  KnowledgeBaseUpdatePayload,
  KnowledgeUsageRange,
  KnowledgeUsageSummary,
} from '@zeta/common/knowledge-bases'

export const listKnowledgeBases = () =>
  responseData(serverApi.get('/knowledge-bases') as Promise<Response<KnowledgeBase[]>>)

export const getKnowledgeBase = (id: string) =>
  responseData(serverApi.get(`/knowledge-bases/${id}`) as Promise<Response<KnowledgeBase>>)

export const createKnowledgeBase = (payload: KnowledgeBasePayload) =>
  responseData(serverApi.post('/knowledge-bases', payload) as Promise<Response<KnowledgeBase>>)

export const updateKnowledgeBase = (id: string, payload: KnowledgeBaseUpdatePayload) =>
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
