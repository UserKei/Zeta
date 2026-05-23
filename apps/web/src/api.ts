import {
  clearAuth,
  getAccessToken,
  getRefreshToken,
  saveToken,
  type AuthUser,
  type TokenPair,
} from './auth'
import type {
  KnowledgeChunk,
  KnowledgeDocument,
  ManualDocumentPayload,
  RetrievalResult,
  RetrievalTestPayload,
} from '@zeta/common/knowledge-docs'

type ApiEnvelope<T> = {
  success: boolean
  code: number
  message: string
  data: T
}

export type AiModelType = 'CHAT' | 'EMBEDDING' | 'RERANKER'
export type KnowledgeBaseStatus = 'ACTIVE' | 'DISABLED'

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

export type AiModel = {
  id: string
  name: string
  provider: string
  type: AiModelType
  modelName: string
  baseUrl: string | null
  apiKeyMasked: string | null
  isEnabled: boolean
  createdAt: string
  updatedAt: string
}

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

export type ModelPayload = {
  name: string
  provider: string
  type: AiModelType
  modelName: string
  baseUrl?: string
  apiKey?: string
  isEnabled: boolean
}

export type KnowledgeBasePayload = {
  name: string
  description?: string
  status: KnowledgeBaseStatus
  embeddingModelId: string
  chunkSize: number
  chunkOverlap: number
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

const request = async <T>(
  path: string,
  init: RequestInit = {},
  retryAfterRefresh = true,
): Promise<T> => {
  const headers = new Headers(init.headers)
  const accessToken = getAccessToken()

  headers.set('Content-Type', 'application/json')

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
  })

  if (response.status === 401 && retryAfterRefresh && path !== '/user/refresh-token') {
    const refreshed = await refreshToken()

    if (refreshed) {
      return request<T>(path, init, false)
    }
  }

  const payload = (await response.json()) as ApiEnvelope<T>

  if (!response.ok || !payload.success) {
    throw new Error(payload.message || '请求失败')
  }

  return payload.data
}

const refreshToken = async () => {
  const refreshTokenValue = getRefreshToken()

  if (!refreshTokenValue) {
    clearAuth()
    return false
  }

  try {
    const token = await request<TokenPair>(
      '/user/refresh-token',
      {
        method: 'POST',
        body: JSON.stringify({ refreshToken: refreshTokenValue }),
      },
      false,
    )
    saveToken(token)

    return true
  } catch {
    clearAuth()
    return false
  }
}

export const login = (username: string, password: string) =>
  request<{ user: AuthUser; token: TokenPair }>('/user/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })

export const getCurrentUser = () => request<AuthUser>('/user/me')

export const listModels = () => request<AiModel[]>('/models')

export const createModel = (payload: ModelPayload) =>
  request<AiModel>('/models', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const updateModel = (id: string, payload: Partial<ModelPayload>) =>
  request<AiModel>(`/models/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })

export const deleteModel = (id: string) =>
  request<{ id: string }>(`/models/${id}`, {
    method: 'DELETE',
  })

export const listKnowledgeBases = () => request<KnowledgeBase[]>('/knowledge-bases')

export const getKnowledgeBase = (id: string) => request<KnowledgeBase>(`/knowledge-bases/${id}`)

export const createKnowledgeBase = (payload: KnowledgeBasePayload) =>
  request<KnowledgeBase>('/knowledge-bases', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const updateKnowledgeBase = (id: string, payload: Partial<KnowledgeBasePayload>) =>
  request<KnowledgeBase>(`/knowledge-bases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })

export const deleteKnowledgeBase = (id: string) =>
  request<{ id: string }>(`/knowledge-bases/${id}`, {
    method: 'DELETE',
  })

export const listDocuments = (knowledgeBaseId: string) =>
  request<KnowledgeDocument[]>(`/knowledge-bases/${knowledgeBaseId}/documents`)

export const createManualDocument = (
  knowledgeBaseId: string,
  payload: ManualDocumentPayload,
) =>
  request<KnowledgeDocument>(`/knowledge-bases/${knowledgeBaseId}/documents/manual`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const listDocumentChunks = (documentId: string) =>
  request<KnowledgeChunk[]>(`/documents/${documentId}/chunks`)

export const deleteDocument = (documentId: string) =>
  request<{ id: string }>(`/documents/${documentId}`, {
    method: 'DELETE',
  })

export const testKnowledgeBaseRetrieval = (
  knowledgeBaseId: string,
  payload: RetrievalTestPayload,
) =>
  request<RetrievalResult>(`/knowledge-bases/${knowledgeBaseId}/retrieval-test`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
