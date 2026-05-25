export const AgentStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  DISABLED: 'DISABLED',
} as const;

export type AgentStatus = (typeof AgentStatus)[keyof typeof AgentStatus];

export type AgentModelSummary = {
  id: string;
  name: string;
  provider: string;
  modelName: string;
  isEnabled: boolean;
};

export type AgentKnowledgeBaseSummary = {
  id: string;
  name: string;
  status: 'ACTIVE' | 'DISABLED';
};

export type Agent = {
  id: string;
  name: string;
  description: string | null;
  modelId: string | null;
  systemPrompt: string;
  openingMessage: string | null;
  status: AgentStatus;
  temperature: number | null;
  topP: number | null;
  createdAt: string;
  updatedAt: string;
  model: AgentModelSummary | null;
  knowledgeBases: AgentKnowledgeBaseSummary[];
};

export type AgentPayload = {
  name: string;
  description?: string;
  modelId: string;
  knowledgeBaseIds: string[];
  systemPrompt: string;
  openingMessage?: string;
  status: AgentStatus;
  temperature?: number | null;
  topP?: number | null;
};
