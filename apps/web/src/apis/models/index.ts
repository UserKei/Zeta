import { responseData, serverApi, type Response } from '..'
import type {
  AiModel,
  AiModelType,
  ModelCatalogModel,
  ModelCatalogProvider,
  ModelPayload,
  ModelTypeOption,
  ModelUpdatePayload,
} from '@zeta/common/models'

export type {
  AiModel,
  AiModelType,
  ModelCatalogModel,
  ModelCatalogProvider,
  ModelPayload,
  ModelTypeOption,
  ModelUpdatePayload,
} from '@zeta/common/models'

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

export const updateModel = (id: string, payload: ModelUpdatePayload) =>
  responseData(serverApi.patch(`/models/${id}`, payload) as Promise<Response<AiModel>>)

export const deleteModel = (id: string) =>
  responseData(serverApi.delete(`/models/${id}`) as Promise<Response<{ id: string }>>)
