import { fetchEventSource } from '@microsoft/fetch-event-source'
import { apiBaseUrl, responseData, serverApi, type Response } from '..'
import { useUserStore } from '@/stores/user'
import type {
  ChatMessage,
  ChatPayload,
  ChatResponse,
  ChatSession,
  ChatStreamEvent,
} from '@zeta/common/chat'

export type {
  ChatCitation,
  ChatMessage,
  ChatMessageRole,
  ChatPayload,
  ChatResponse,
  ChatSession,
  ChatStreamEvent,
} from '@zeta/common/chat'

type StreamHandlers = {
  signal?: AbortSignal
  onEvent: (event: ChatStreamEvent) => void
}

export const sendAgentMessage = (agentId: string, payload: ChatPayload) =>
  responseData(
    serverApi.post(`/agents/${agentId}/chat`, payload) as Promise<
      Response<ChatResponse>
    >,
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

export const listChatSessions = () =>
  responseData(
    serverApi.get('/chat-sessions') as Promise<Response<ChatSession[]>>,
  )

export const listChatMessages = (sessionId: string) =>
  responseData(
    serverApi.get(`/chat-sessions/${sessionId}/messages`) as Promise<
      Response<ChatMessage[]>
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
