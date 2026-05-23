import { responseData, serverApi, type Response } from '..'
import type { Agent, AgentPayload } from '@zeta/common/agents'

export type {
  Agent,
  AgentKnowledgeBaseSummary,
  AgentPayload,
  AgentStatus,
} from '@zeta/common/agents'

export const listAgents = () =>
  responseData(serverApi.get('/agents') as Promise<Response<Agent[]>>)

export const getAgent = (id: string) =>
  responseData(serverApi.get(`/agents/${id}`) as Promise<Response<Agent>>)

export const createAgent = (payload: AgentPayload) =>
  responseData(
    serverApi.post('/agents', payload) as Promise<Response<Agent>>,
  )

export const updateAgent = (id: string, payload: Partial<AgentPayload>) =>
  responseData(
    serverApi.patch(`/agents/${id}`, payload) as Promise<Response<Agent>>,
  )

export const deleteAgent = (id: string) =>
  responseData(
    serverApi.delete(`/agents/${id}`) as Promise<Response<{ id: string }>>,
  )
