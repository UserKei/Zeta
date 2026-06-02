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

export type ModelTypeOption = {
  value: AiModelType
  label: string
}

export type ModelCatalogModel = {
  value: string
  label: string
  type: AiModelType
  description?: string
  defaultBaseUrl?: string
  defaultConfigJson?: Record<string, unknown>
}

export type ModelCatalogProvider = {
  value: string
  label: string
  icon?: string
  description?: string
  note?: string
  defaultBaseUrl?: string
  supportedTypes: AiModelType[]
  defaultConfigJson?: Record<string, unknown>
}

export const listModels = () =>
  responseData(serverApi.get('/models') as Promise<Response<AiModel[]>>)

export const listModelCatalogProviders = () =>
  responseData(
    serverApi.get('/models/catalog/providers') as Promise<Response<ModelCatalogProvider[]>>,
  )

export const listModelCatalogTypes = (provider: string) =>
  responseData(
    serverApi.get('/models/catalog/types', {
      params: { provider },
    }) as Promise<Response<ModelTypeOption[]>>,
  )

export const listModelCatalogModels = (provider: string, type: AiModelType) =>
  responseData(
    serverApi.get('/models/catalog/models', {
      params: { provider, type },
    }) as Promise<Response<ModelCatalogModel[]>>,
  )

export const createModel = (payload: ModelPayload) =>
  responseData(serverApi.post('/models', payload) as Promise<Response<AiModel>>)

export const updateModel = (id: string, payload: Partial<ModelPayload>) =>
  responseData(serverApi.patch(`/models/${id}`, payload) as Promise<Response<AiModel>>)

export const deleteModel = (id: string) =>
  responseData(serverApi.delete(`/models/${id}`) as Promise<Response<{ id: string }>>)
