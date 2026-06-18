import { fetchEventSource } from '@microsoft/fetch-event-source'
import { apiBaseUrl, responseData, serverApi, type Response } from '..'
import { useUserStore } from '@/stores/user'
import type {
  ChatImproveDeleteResponse,
  ChatImprovePayload,
  ChatImproveRecordDetail,
  ChatImproveResponse,
  ChatMessage,
  ChatMessageListQuery,
  ChatPayload,
  ChatResponse,
  ChatSession,
  ChatSessionListQuery,
  ChatSessionSummary,
  ChatSessionSummaryQuery,
  ChatStreamEvent,
} from '@zeta/common/chat'
import type { PageResult } from '@zeta/common/pagination'

export type {
  ChatCitation,
  ChatImproveDeleteResponse,
  ChatImprovePayload,
  ChatImproveRecord,
  ChatImproveRecordDetail,
  ChatImproveResponse,
  ChatMessage,
  ChatMessageListQuery,
  ChatMessageRole,
  ChatPayload,
  ChatResponse,
  ChatSession,
  ChatSessionListQuery,
  ChatSessionSummary,
  ChatSessionSummaryQuery,
  ChatStreamEvent,
} from '@zeta/common/chat'

type StreamHandlers = {
  signal?: AbortSignal
  onEvent: (event: ChatStreamEvent) => void
}

export const sendAgentMessage = (agentId: string, payload: ChatPayload) =>
  responseData(
    serverApi.post(`/agents/${agentId}/chat`, payload) as Promise<Response<ChatResponse>>,
  )

export const sendAgentMessageStream = async (
  agentId: string,
  payload: ChatPayload,
  handlers: StreamHandlers,
) => {
  const userStore = useUserStore()

  await fetchEventSource(`${apiBaseUrl}/agents/${agentId}/chat/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${userStore.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: handlers.signal,
    async onopen(response) {
      if (response.ok) {
        return
      }

      throw new Error(await readStreamError(response))
    },
    onmessage(event) {
      if (!event.data) {
        return
      }

      const data = JSON.parse(event.data) as ChatStreamEvent
      handlers.onEvent(data)

      if (data.type === 'error') {
        throw new Error(data.message)
      }
    },
    onerror(cause) {
      throw cause
    },
  })
}

export const listChatSessions = (query: ChatSessionListQuery = {}) =>
  responseData(
    serverApi.get('/chat-sessions', { params: query }) as Promise<
      Response<PageResult<ChatSession>>
    >,
  )

export const listAgentChatSessionSummaries = (
  agentId: string,
  query: ChatSessionSummaryQuery = {},
) =>
  responseData(
    serverApi.get(`/agents/${agentId}/chat-sessions/summary`, {
      params: query,
    }) as Promise<Response<PageResult<ChatSessionSummary>>>,
  )

export const listChatMessages = (sessionId: string, query: ChatMessageListQuery = {}) =>
  responseData(
    serverApi.get(`/chat-sessions/${sessionId}/messages`, { params: query }) as Promise<
      Response<PageResult<ChatMessage>>
    >,
  )

export const improveChatMessage = (messageId: string, payload: ChatImprovePayload) =>
  responseData(
    serverApi.post(`/chat-messages/${messageId}/improve`, payload) as Promise<
      Response<ChatImproveResponse>
    >,
  )

export const listChatMessageImproves = (messageId: string) =>
  responseData(
    serverApi.get(`/chat-messages/${messageId}/improve`) as Promise<
      Response<ChatImproveRecordDetail[]>
    >,
  )

export const deleteChatMessageImprove = (messageId: string, chunkId: string) =>
  responseData(
    serverApi.delete(`/chat-messages/${messageId}/improve/${chunkId}`) as Promise<
      Response<ChatImproveDeleteResponse>
    >,
  )

const readStreamError = async (response: globalThis.Response) => {
  const text = await response.text()

  try {
    const payload = JSON.parse(text) as Response

    return payload.message || response.statusText || '流式请求失败'
  } catch {
    return text || response.statusText || '流式请求失败'
  }
}
