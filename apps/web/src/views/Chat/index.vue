<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import {
  listChatMessages,
  listChatSessions,
  sendAgentMessageStream,
  type ChatCitation,
  type ChatMessage,
  type ChatResponse,
  type ChatSession,
  type ChatStreamEvent,
} from '@/apis/chat'
import { getAgent, type Agent } from '@/apis/agents'
import SessionSidebar from './components/SessionSidebar.vue'
import MessageList from './components/MessageList.vue'
import ChatComposer from './components/ChatComposer.vue'
import ChatCitationDialog from '@/components/chat/ChatCitationDialog.vue'
import { showErrorMessage } from '@/utils/feedback'

defineOptions({
  name: 'AgentChatView',
})

const route = useRoute()
const router = useRouter()
const agentId = computed(() => String(route.params.agentId ?? ''))

const agent = ref<Agent | null>(null)
const sessions = ref<ChatSession[]>([])
const messages = ref<ChatMessage[]>([])
const sessionId = ref<string | null>(null)
const loading = ref(false)
const sending = ref(false)
const streamingMessageId = ref('')
const streamController = ref<AbortController | null>(null)
const citationDialogVisible = ref(false)
const selectedCitations = ref<ChatCitation[]>([])

const form = reactive({
  message: '',
  topK: 5,
})

const agentSessions = computed(() =>
  sessions.value.filter((session) => session.agentId === agentId.value),
)
const chatUnavailable = computed(() => agent.value !== null && !agent.value.model)

const load = async () => {
  loading.value = true

  try {
    const [agentDetail, sessionList] = await Promise.all([
      getAgent(agentId.value),
      listChatSessions(),
    ])
    agent.value = agentDetail
    sessions.value = sessionList
  } catch (cause) {
    showErrorMessage(cause, '加载聊天页失败')
  } finally {
    loading.value = false
  }
}

const loadSession = async (session: ChatSession) => {
  sessionId.value = session.id

  try {
    messages.value = await listChatMessages(session.id)
  } catch (cause) {
    showErrorMessage(cause, '加载会话失败')
  }
}

const startNewSession = () => {
  if (sending.value) {
    return
  }

  sessionId.value = null
  messages.value = []
  form.message = ''
}

const send = async () => {
  const message = form.message.trim()

  if (!message) {
    return
  }

  sending.value = true
  const userTempId = createLocalId('user')
  const assistantTempId = createLocalId('assistant')
  const localSessionId = sessionId.value ?? createLocalId('session')
  const now = new Date().toISOString()

  messages.value.push(
    createLocalMessage({
      id: userTempId,
      sessionId: localSessionId,
      role: 'USER',
      content: message,
      createdAt: now,
    }),
    createLocalMessage({
      id: assistantTempId,
      sessionId: localSessionId,
      role: 'ASSISTANT',
      content: '',
      createdAt: now,
    }),
  )
  streamingMessageId.value = assistantTempId
  form.message = ''
  const controller = new AbortController()
  streamController.value = controller

  try {
    await sendAgentMessageStream(
      agentId.value,
      {
        message,
        topK: form.topK,
        sessionId: sessionId.value ?? undefined,
      },
      {
        signal: controller.signal,
        onEvent: (event) => handleStreamEvent(event, userTempId, assistantTempId),
      },
    )
  } catch (cause) {
    if (controller.signal.aborted) {
      stopLocalAssistantMessage(assistantTempId)
    } else {
      showErrorMessage(cause, '发送消息失败')
      removeLocalAssistantMessage(assistantTempId)
    }
  } finally {
    sending.value = false
    streamingMessageId.value = ''
    streamController.value = null
  }
}

const stopStreaming = () => {
  streamController.value?.abort()
}

const handleStreamEvent = (event: ChatStreamEvent, userTempId: string, assistantTempId: string) => {
  if (event.type === 'delta') {
    appendAssistantDelta(assistantTempId, event.content)
    return
  }

  if (event.type === 'done') {
    applyStreamResponse(event.response, userTempId, assistantTempId)
    return
  }

  // The stream client throws after an error event, so the catch block owns the toast.
}

const appendAssistantDelta = (messageId: string, content: string) => {
  const message = messages.value.find((item) => item.id === messageId)

  if (message) {
    message.content += content
  }
}

const applyStreamResponse = (
  response: ChatResponse,
  userTempId: string,
  assistantTempId: string,
) => {
  sessionId.value = response.session.id
  replaceMessage(userTempId, response.userMessage)
  replaceMessage(assistantTempId, response.assistantMessage)
  upsertSession(response.session)
}

const replaceMessage = (localId: string, message: ChatMessage) => {
  const index = messages.value.findIndex((item) => item.id === localId)

  if (index >= 0) {
    messages.value[index] = message
  } else {
    messages.value.push(message)
  }
}

const stopLocalAssistantMessage = (messageId: string) => {
  const message = messages.value.find((item) => item.id === messageId)

  if (message && !message.content.trim()) {
    message.content = '已停止生成。'
  }
}

const removeLocalAssistantMessage = (messageId: string) => {
  messages.value = messages.value.filter((message) => message.id !== messageId)
}

const openCitationDialog = (citations: ChatCitation[]) => {
  selectedCitations.value = citations
  citationDialogVisible.value = true
}

const upsertSession = (session: ChatSession) => {
  const index = sessions.value.findIndex((item) => item.id === session.id)

  if (index >= 0) {
    sessions.value[index] = session
  } else {
    sessions.value.unshift(session)
  }
}

const createLocalId = (prefix: string) =>
  `local-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`

const createLocalMessage = (message: {
  id: string
  sessionId: string
  role: ChatMessage['role']
  content: string
  createdAt: string
}): ChatMessage => ({
  ...message,
  modelId: null,
  tokenUsage: {},
  citations: [],
  improveRecords: [],
})

const applySuggestedQuestion = (question: string) => {
  if (sending.value) {
    return
  }

  form.message = question
}

onMounted(load)
</script>

<template>
  <SidebarProvider class="min-h-screen overflow-hidden bg-background">
    <SessionSidebar
      :agent="agent"
      :current-session-id="sessionId"
      :loading="loading"
      :sending="sending"
      :sessions="agentSessions"
      @back="router.push({ name: 'agents' })"
      @new-session="startNewSession"
      @select-session="loadSession"
    />

    <SidebarInset class="h-screen min-w-0 overflow-hidden bg-background p-3 md:p-4">
      <section
        class="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm"
      >
        <header
          class="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6"
        >
          <div class="flex min-w-0 items-center gap-2">
            <SidebarTrigger class="md:hidden" />
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-muted-foreground">
                {{ agent?.name || 'Agent' }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Badge variant="secondary">
              {{ sessionId ? '当前会话' : '新会话' }}
            </Badge>
            <Button
              class="md:hidden"
              type="button"
              variant="outline"
              size="sm"
              :disabled="sending"
              @click="startNewSession"
            >
              新会话
            </Button>
          </div>
        </header>

        <MessageList
          :agent-name="agent?.name || 'Agent'"
          :messages="messages"
          :opening-message="agent?.openingMessage || agent?.description || ''"
          :streaming-message-id="streamingMessageId"
          @ask="applySuggestedQuestion"
          @open-citations="openCitationDialog"
        />

        <ChatComposer
          v-model:message="form.message"
          v-model:top-k="form.topK"
          :disabled="chatUnavailable"
          disabled-reason="当前 Agent 未配置对话模型，请返回 Agent 页面重新选择模型。"
          :sending="sending"
          @stop="stopStreaming"
          @submit="send"
        />
      </section>
    </SidebarInset>

    <ChatCitationDialog v-model:visible="citationDialogVisible" :citations="selectedCitations" />
  </SidebarProvider>
</template>
