import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import router from '@/router'
import { useUserStore } from '@/stores/user'
import type { TokenPair } from '@zeta/common/user'

export type Response<T = unknown> = {
  timestamp: string
  path: string
  message: string
  code: number
  success: boolean
  data: T
}

type RetryRequest = InternalAxiosRequestConfig & {
  _retry?: boolean
}

type PendingRequest = {
  request: RetryRequest
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
const timeout = 50000

export const serverApi = axios.create({
  baseURL: apiBaseUrl,
  timeout,
})

const refreshApi = axios.create({
  baseURL: apiBaseUrl,
  timeout,
})

let isRefreshing = false
let requestQueue: PendingRequest[] = []

serverApi.interceptors.request.use((config) => {
  const userStore = useUserStore()

  if (userStore.accessToken) {
    config.headers.Authorization = `Bearer ${userStore.accessToken}`
  }

  return config
})

serverApi.interceptors.response.use(
  (response) => {
    const payload = response.data as Response

    if (payload && payload.success === false) {
      return Promise.reject(new Error(payload.message || '请求失败'))
    }

    return response
  },
  async (error: AxiosError<Response>) => {
    const status = error.response?.status
    const originalRequest = error.config as RetryRequest | undefined

    if (status !== 401 || !originalRequest || originalRequest._retry) {
      return Promise.reject(toApiError(error))
    }

    const userStore = useUserStore()

    if (!userStore.refreshToken) {
      await logoutToLogin(userStore)
      return Promise.reject(new Error('登录状态已过期，请重新登录'))
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        requestQueue.push({
          request: originalRequest,
          resolve,
          reject,
        })
      })
    }

    originalRequest._retry = true
    isRefreshing = true

    try {
      const response = await refreshApi.post<Response<TokenPair>>('/user/refresh-token', {
        refreshToken: userStore.refreshToken,
      })
      const payload = response.data

      if (!payload.success) {
        throw new Error(payload.message || '登录状态已过期，请重新登录')
      }

      userStore.updateToken(payload.data)
      replayQueuedRequests(payload.data.accessToken)

      originalRequest.headers.Authorization = `Bearer ${payload.data.accessToken}`

      return serverApi(originalRequest)
    } catch (cause) {
      rejectQueuedRequests(cause)
      await logoutToLogin(userStore)

      return Promise.reject(cause)
    } finally {
      requestQueue = []
      isRefreshing = false
    }
  },
)

export const responseData = async <T>(
  request: Promise<Response<T> | { data: Response<T> }>,
) => {
  const response = await request

  return 'success' in response ? response.data : response.data.data
}

const replayQueuedRequests = (accessToken: string) => {
  requestQueue.forEach((pending) => {
    pending.request.headers.Authorization = `Bearer ${accessToken}`
    pending.resolve(serverApi(pending.request))
  })
}

const rejectQueuedRequests = (cause: unknown) => {
  requestQueue.forEach((pending) => pending.reject(cause))
}

const logoutToLogin = async (userStore: ReturnType<typeof useUserStore>) => {
  userStore.logout()

  if (router.currentRoute.value.name !== 'login') {
    await router.replace({ name: 'login' })
  }
}

const toApiError = (error: AxiosError<Response>) => {
  const message = error.response?.data?.message || error.message || '请求失败'

  return new Error(message)
}
