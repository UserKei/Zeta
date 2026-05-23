<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  getAgent,
  getCurrentUser,
  listChatMessages,
  listChatSessions,
  sendAgentMessage,
  type Agent,
  type ChatMessage,
  type ChatSession,
} from '@/api'
import { clearAuth, getStoredUser, type AuthUser } from '@/auth'

const route = useRoute()
const router = useRouter()
const agentId = computed(() => String(route.params.id ?? ''))

const user = ref<AuthUser | null>(getStoredUser())
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
    const [currentUser, agentDetail, sessionList] = await Promise.all([
      getCurrentUser(),
      getAgent(agentId.value),
      listChatSessions(),
    ])
    user.value = currentUser
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

const logout = async () => {
  clearAuth()
  await router.replace({ name: 'login' })
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
  <main class="workspace">
    <aside class="sidebar">
      <div>
        <p class="brand">Zeta</p>
        <nav>
          <button class="nav-item" @click="router.push({ name: 'models' })">模型管理</button>
          <button class="nav-item" @click="router.push({ name: 'knowledge-bases' })">知识库</button>
          <button class="nav-item active" @click="router.push({ name: 'agents' })">专家 Agent</button>
        </nav>
      </div>

      <footer>
        <strong>{{ user?.displayName || user?.username || '当前用户' }}</strong>
        <button class="button secondary" @click="logout">退出</button>
      </footer>
    </aside>

    <section class="content">
      <header class="page-head">
        <div>
          <p class="eyebrow">Agent 问答</p>
          <h1>{{ agent?.name || 'Agent 聊天' }}</h1>
          <p>{{ agent?.description || '基于绑定知识库召回内容并生成回答。' }}</p>
        </div>
        <div class="head-actions">
          <button class="button secondary" @click="router.push({ name: 'agents' })">返回</button>
          <button class="button" @click="startNewSession">新会话</button>
        </div>
      </header>

      <p v-if="error" class="message">{{ error }}</p>

      <section class="chat-grid">
        <aside class="session-panel">
          <header>
            <h2>我的聊天记录</h2>
          </header>
          <div v-if="loading" class="empty compact">会话加载中</div>
          <div v-else-if="agentSessions.length === 0" class="empty compact">还没有会话</div>
          <button
            v-for="session in agentSessions"
            :key="session.id"
            :class="['session-item', session.id === sessionId ? 'active' : '']"
            @click="loadSession(session)"
          >
            <strong>{{ session.title || '未命名会话' }}</strong>
            <span>{{ formatTime(session.updatedAt) }}</span>
          </button>
        </aside>

        <section class="chat-panel">
          <div class="message-list">
            <article v-if="messages.length === 0" class="opening">
              {{ agent?.openingMessage || '开始提问后，Agent 会基于绑定知识库回答并展示引用来源。' }}
            </article>

            <article
              v-for="message in messages"
              :key="message.id"
              :class="['chat-message', message.role === 'USER' ? 'user' : 'assistant']"
            >
              <header>
                <strong>{{ message.role === 'USER' ? '你' : agent?.name || 'Agent' }}</strong>
                <span>{{ formatTime(message.createdAt) }}</span>
              </header>
              <p>{{ message.content }}</p>

              <div v-if="message.citations.length > 0" class="citation-list">
                <article v-for="citation in message.citations" :key="citation.id" class="citation">
                  <header>
                    <strong>{{ citation.documentName }}</strong>
                    <span v-if="citation.score !== null">
                      {{ (citation.score * 100).toFixed(1) }}%
                    </span>
                  </header>
                  <p>{{ citation.quote }}</p>
                  <small>分块 #{{ citation.chunkPosition + 1 }}</small>
                </article>
              </div>
            </article>
          </div>

          <form class="composer" @submit.prevent="send">
            <label class="field top-k">
              Top K
              <input v-model.number="form.topK" max="20" min="1" required type="number" />
            </label>
            <label class="field message-field">
              问题
              <textarea
                v-model="form.message"
                :disabled="sending"
                placeholder="例如：我怎么开通 IT 账号？"
                required
                rows="3"
              />
            </label>
            <button class="button" :disabled="sending" type="submit">
              {{ sending ? '回答中' : '发送' }}
            </button>
          </form>
        </section>
      </section>
    </section>
  </main>
</template>

<style scoped>
.workspace {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
}

.sidebar {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-right: 1px solid var(--zeta-line);
  padding: 28px 18px;
  background: #fff;
}

.brand {
  margin: 0 0 34px;
  color: var(--zeta-blue);
  font-size: 28px;
  font-weight: 800;
}

nav {
  display: grid;
  gap: 8px;
}

.nav-item {
  min-height: 44px;
  border: 0;
  border-radius: 8px;
  padding: 0 14px;
  background: transparent;
  color: var(--zeta-muted);
  text-align: left;
}

.nav-item.active {
  background: var(--zeta-blue-soft);
  color: var(--zeta-blue);
  font-weight: 700;
}

.sidebar footer {
  display: grid;
  gap: 12px;
}

.content {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 20px;
  padding: clamp(20px, 4vw, 44px);
  background:
    linear-gradient(180deg, rgba(36, 107, 253, 0.1), transparent 210px),
    var(--zeta-bg);
}

.page-head,
.head-actions {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 18px;
}

.head-actions {
  align-items: center;
}

.eyebrow {
  margin: 0 0 10px;
  color: var(--zeta-blue);
  font-weight: 700;
}

h1,
h2 {
  margin: 0;
}

h1 {
  font-size: 34px;
}

h2 {
  font-size: 18px;
}

.page-head p:last-child {
  margin: 10px 0 0;
  color: var(--zeta-muted);
}

.chat-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 18px;
}

.session-panel,
.chat-panel {
  border: 1px solid var(--zeta-line);
  border-radius: 8px;
  background: var(--zeta-panel);
}

.session-panel {
  align-content: start;
  display: grid;
  overflow: hidden;
}

.session-panel header {
  border-bottom: 1px solid var(--zeta-line);
  padding: 18px;
}

.session-item {
  display: grid;
  gap: 6px;
  border: 0;
  border-bottom: 1px solid var(--zeta-line);
  padding: 14px 18px;
  background: #fff;
  color: var(--zeta-ink);
  text-align: left;
}

.session-item.active {
  background: var(--zeta-blue-soft);
}

.session-item span {
  color: var(--zeta-muted);
  font-size: 13px;
}

.chat-panel {
  min-width: 0;
  min-height: 640px;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  overflow: hidden;
}

.message-list {
  display: grid;
  align-content: start;
  gap: 16px;
  overflow: auto;
  padding: 20px;
}

.opening,
.empty {
  display: grid;
  place-items: center;
  color: var(--zeta-muted);
}

.opening {
  min-height: 260px;
  border: 1px dashed var(--zeta-line);
  border-radius: 8px;
  padding: 24px;
  background: #fff;
  text-align: center;
}

.empty.compact {
  min-height: 96px;
  padding: 16px;
}

.chat-message {
  width: min(100%, 860px);
  display: grid;
  gap: 10px;
  border: 1px solid var(--zeta-line);
  border-radius: 8px;
  padding: 16px;
  background: #fff;
}

.chat-message.user {
  justify-self: end;
  width: min(100%, 680px);
  background: #f3f7ff;
}

.chat-message header,
.citation header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--zeta-muted);
  font-size: 13px;
}

.chat-message p,
.citation p {
  margin: 0;
  line-height: 1.7;
  white-space: pre-wrap;
}

.citation-list {
  display: grid;
  gap: 10px;
}

.citation {
  display: grid;
  gap: 8px;
  border-left: 3px solid var(--zeta-blue);
  border-radius: 6px;
  padding: 12px;
  background: #f8faff;
}

.citation p {
  max-height: 180px;
  overflow: auto;
  color: #25324a;
}

.citation small {
  color: var(--zeta-muted);
}

.composer {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr) auto;
  align-items: end;
  gap: 14px;
  border-top: 1px solid var(--zeta-line);
  padding: 16px;
  background: #fff;
}

.message-field textarea {
  min-height: 76px;
}

@media (max-width: 1080px) {
  .chat-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 820px) {
  .workspace {
    grid-template-columns: 1fr;
  }

  .sidebar {
    gap: 18px;
    border-right: 0;
    border-bottom: 1px solid var(--zeta-line);
  }

  .brand {
    margin-bottom: 16px;
  }

  nav,
  .composer {
    grid-template-columns: 1fr;
  }

  .page-head,
  .head-actions {
    align-items: start;
    flex-direction: column;
  }
}
</style>
