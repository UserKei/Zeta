import type { RetrievalHit } from '../knowledge-docs';

export const ChatMessageRole = {
  SYSTEM: 'SYSTEM',
  USER: 'USER',
  ASSISTANT: 'ASSISTANT',
} as const;

export type ChatMessageRole =
  (typeof ChatMessageRole)[keyof typeof ChatMessageRole];

export type ChatAgentSummary = {
  id: string;
  name: string;
};

export type ChatSession = {
  id: string;
  userId: string;
  agentId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  agent: ChatAgentSummary;
};

export type ChatCitation = {
  id: string;
  chunkId: string;
  documentId: string;
  documentName: string;
  chunkPosition: number;
  score: number | null;
  quote: string | null;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  modelId: string | null;
  tokenUsage: unknown;
  createdAt: string;
  citations: ChatCitation[];
};

export type ChatPayload = {
  message: string;
  sessionId?: string;
  topK?: number;
};

export type ChatResponse = {
  session: ChatSession;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  hits: RetrievalHit[];
};
