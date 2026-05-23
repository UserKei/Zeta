import { responseData, serverApi, type Response } from '..'
import type {
  ChatMessage,
  ChatPayload,
  ChatResponse,
  ChatSession,
} from '@zeta/common/chat'

export type {
  ChatCitation,
  ChatMessage,
  ChatMessageRole,
  ChatPayload,
  ChatResponse,
  ChatSession,
} from '@zeta/common/chat'

export const sendAgentMessage = (agentId: string, payload: ChatPayload) =>
  responseData(
    serverApi.post(`/agents/${agentId}/chat`, payload) as Promise<
      Response<ChatResponse>
    >,
  )

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
