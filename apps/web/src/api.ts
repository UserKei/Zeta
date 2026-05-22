import {
  clearAuth,
  getAccessToken,
  getRefreshToken,
  saveToken,
  type AuthUser,
  type TokenPair,
} from './auth'

type ApiEnvelope<T> = {
  success: boolean
  code: number
  message: string
  data: T
}

export type AiModelType = 'CHAT' | 'EMBEDDING' | 'RERANKER'

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

export type ModelPayload = {
  name: string
  provider: string
  type: AiModelType
  modelName: string
  baseUrl?: string
  apiKey?: string
  isEnabled: boolean
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
