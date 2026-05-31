import { responseData, serverApi, type Response } from '..'

export type AiModelType = 'CHAT' | 'EMBEDDING' | 'RERANKER' | 'IMAGE'

export type AiModel = {
  id: string
  name: string
  provider: string
  type: AiModelType
  modelName: string
  baseUrl: string | null
  configJson: Record<string, unknown>
  apiKeyMasked: string | null
  isEnabled: boolean
  createdAt: string
  updatedAt: string
}

export type ModelPayload = {
  name: string
  provider: string
  type: AiModelType
  modelName: string
  baseUrl?: string
  apiKey?: string
  isEnabled: boolean
  configJson?: Record<string, unknown> | null
}

export const listModels = () =>
  responseData(serverApi.get('/models') as Promise<Response<AiModel[]>>)

export const createModel = (payload: ModelPayload) =>
  responseData(
    serverApi.post('/models', payload) as Promise<Response<AiModel>>,
  )

export const updateModel = (id: string, payload: Partial<ModelPayload>) =>
  responseData(
    serverApi.patch(`/models/${id}`, payload) as Promise<Response<AiModel>>,
  )

export const deleteModel = (id: string) =>
  responseData(
    serverApi.delete(`/models/${id}`) as Promise<Response<{ id: string }>>,
  )
