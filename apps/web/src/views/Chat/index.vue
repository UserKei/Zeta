<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  listChatMessages,
  listChatSessions,
  sendAgentMessage,
  type ChatMessage,
  type ChatSession,
} from '@/apis/chat'
import { getAgent, type Agent } from '@/apis/agents'

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
const error = ref('')
const loading = ref(false)
const sending = ref(false)

const form = reactive({
  message: '',
  topK: 5,
})

const agentSessions = computed(() =>
  sessions.value.filter((session) => session.agentId === agentId.value),
)

const load = async () => {
  loading.value = true
  error.value = ''

  try {
    const [agentDetail, sessionList] = await Promise.all([
      getAgent(agentId.value),
      listChatSessions(),
    ])
    agent.value = agentDetail
    sessions.value = sessionList
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载聊天页失败'
  } finally {
    loading.value = false
  }
}

const loadSession = async (session: ChatSession) => {
  error.value = ''
  sessionId.value = session.id

  try {
    messages.value = await listChatMessages(session.id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载会话失败'
  }
}

const startNewSession = () => {
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
  error.value = ''

  try {
    const response = await sendAgentMessage(agentId.value, {
      message,
      topK: form.topK,
      sessionId: sessionId.value ?? undefined,
    })
    sessionId.value = response.session.id
    messages.value.push(response.userMessage, response.assistantMessage)
    upsertSession(response.session)
    form.message = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '发送消息失败'
  } finally {
    sending.value = false
  }
}

const upsertSession = (session: ChatSession) => {
  const index = sessions.value.findIndex((item) => item.id === session.id)

  if (index >= 0) {
    sessions.value[index] = session
  } else {
    sessions.value.unshift(session)
  }
}

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

onMounted(load)
</script>

<template>
  <div class="grid gap-5">
    <header class="flex flex-col items-start justify-between gap-4.5 lg:flex-row lg:items-end">
      <div>
        <p class="mb-2.5 font-bold text-(--zeta-blue)">Agent 问答</p>
        <h1 class="m-0 text-[34px] font-bold">{{ agent?.name || 'Agent 聊天' }}</h1>
        <p class="mt-2.5 text-(--zeta-muted)">
          {{ agent?.description || '基于绑定知识库召回内容并生成回答。' }}
        </p>
      </div>
      <div class="flex flex-col items-start gap-4.5 sm:flex-row sm:items-center">
        <el-button @click="router.push({ name: 'agents' })">返回</el-button>
        <el-button type="primary" @click="startNewSession">新会话</el-button>
      </div>
    </header>

    <el-alert v-if="error" :closable="false" :title="error" type="error" />

    <section class="grid min-w-0 grid-cols-1 gap-4.5 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside class="grid content-start overflow-hidden rounded-lg border border-(--zeta-line) bg-(--zeta-panel)">
        <header class="border-b border-(--zeta-line) p-4.5">
          <h2 class="m-0 text-lg font-bold">我的聊天记录</h2>
        </header>
        <div v-if="loading" class="grid min-h-24 place-items-center p-4 text-(--zeta-muted)">
          会话加载中
        </div>
        <div v-else-if="agentSessions.length === 0" class="grid min-h-24 place-items-center p-4 text-(--zeta-muted)">
          还没有会话
        </div>
        <button
          v-for="session in agentSessions"
          :key="session.id"
          :class="[
            'grid w-full gap-1.5 border-b border-(--zeta-line) px-4.5 py-3.5 text-left whitespace-normal text-(--zeta-ink) transition-colors hover:bg-(--zeta-surface-soft) focus-visible:outline-2 focus-visible:outline-(--zeta-blue)',
            session.id === sessionId ? 'bg-(--zeta-blue-soft)' : 'bg-(--zeta-panel)',
          ]"
          type="button"
          @click="loadSession(session)"
        >
          <strong>{{ session.title || '未命名会话' }}</strong>
          <span class="text-[13px] text-(--zeta-muted)">
            {{ formatTime(session.updatedAt) }}
          </span>
        </button>
      </aside>

      <section
        class="grid min-h-160 min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-(--zeta-line) bg-(--zeta-panel)">
        <div class="grid content-start gap-4 overflow-auto p-5">
          <article v-if="messages.length === 0"
            class="grid min-h-65 place-items-center rounded-lg border border-dashed border-(--zeta-line) bg-(--zeta-panel) p-6 text-center text-(--zeta-muted)">
            {{ agent?.openingMessage || '开始提问后，Agent 会基于绑定知识库回答并展示引用来源。' }}
          </article>

          <article v-for="message in messages" :key="message.id" :class="[
            'grid w-full max-w-215 gap-2.5 rounded-lg border border-(--zeta-line) p-4',
            message.role === 'USER'
              ? 'max-w-170 justify-self-end bg-(--zeta-surface-soft)'
              : 'bg-(--zeta-panel)',
          ]">
            <header class="flex justify-between gap-3 text-[13px] text-(--zeta-muted)">
              <strong>{{ message.role === 'USER' ? '你' : agent?.name || 'Agent' }}</strong>
              <span>{{ formatTime(message.createdAt) }}</span>
            </header>
            <p class="m-0 whitespace-pre-wrap leading-7">{{ message.content }}</p>

            <div v-if="message.citations.length > 0" class="grid gap-2.5">
              <article v-for="citation in message.citations" :key="citation.id"
                class="grid gap-2 rounded-md border-l-3 border-l-(--zeta-blue) bg-(--zeta-surface-tint) p-3">
                <header class="flex justify-between gap-3 text-[13px] text-(--zeta-muted)">
                  <strong>{{ citation.documentName }}</strong>
                  <span v-if="citation.score !== null">
                    {{ (citation.score * 100).toFixed(1) }}%
                  </span>
                </header>
                <p class="m-0 max-h-45 overflow-auto whitespace-pre-wrap text-(--zeta-content) leading-7">
                  {{ citation.quote }}
                </p>
                <small class="text-(--zeta-muted)">分块 #{{ citation.chunkPosition + 1 }}</small>
              </article>
            </div>
          </article>
        </div>

        <el-form
          class="grid grid-cols-1 items-end gap-3.5 border-t border-(--zeta-line) bg-(--zeta-panel) p-4 lg:grid-cols-[120px_minmax(0,1fr)_auto]"
          label-position="top"
          @submit.prevent="send"
        >
          <el-form-item class="m-0" label="Top K">
            <el-input-number v-model="form.topK" :max="20" :min="1" controls-position="right" />
          </el-form-item>
          <el-form-item class="m-0" label="问题">
            <el-input v-model="form.message" :disabled="sending" placeholder="例如：我怎么开通 IT 账号？" :rows="3"
              type="textarea" />
          </el-form-item>
          <el-button :loading="sending" native-type="submit" type="primary">
            发送
          </el-button>
        </el-form>
      </section>
    </section>
  </div>
</template>
