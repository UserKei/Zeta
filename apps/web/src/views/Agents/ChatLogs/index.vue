<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { improveChatMessage, listChatMessages, listChatSessions, type ChatMessage, type ChatSession } from '@/apis/chat'
import { getAgent, type Agent } from '@/apis/agents'
import { listDocuments, type KnowledgeDocument } from '@/apis/knowledge-docs'
import { showErrorMessage } from '@/utils/feedback'

defineOptions({
  name: 'AgentChatLogsView',
})

const route = useRoute()
const router = useRouter()
const agentId = computed(() => route.params.agentId as string)
const agent = ref<Agent | null>(null)
const sessions = ref<ChatSession[]>([])
const messages = ref<ChatMessage[]>([])
const documents = ref<KnowledgeDocument[]>([])
const selectedSessionId = ref('')
const loading = ref(false)
const messageLoading = ref(false)
const documentLoading = ref(false)
const improveOpen = ref(false)
const improving = ref(false)

const form = reactive({
  messageId: '',
  knowledgeBaseId: '',
  documentId: '',
  title: '',
  content: '',
})

const currentSessions = computed(() =>
  sessions.value.filter((session) => session.agentId === agentId.value),
)

const targetKnowledgeBases = computed(
  () => agent.value?.knowledgeBases.filter((item) => item.status === 'ACTIVE') ?? [],
)

const selectedSession = computed(() =>
  currentSessions.value.find((session) => session.id === selectedSessionId.value),
)

const load = async () => {
  loading.value = true

  try {
    const [agentDetail, sessionList] = await Promise.all([
      getAgent(agentId.value),
      listChatSessions(),
    ])
    agent.value = agentDetail
    sessions.value = sessionList
    const firstSession = currentSessions.value[0]

    if (firstSession) {
      await selectSession(firstSession)
    }
  } catch (cause) {
    showErrorMessage(cause, '加载聊天日志失败')
  } finally {
    loading.value = false
  }
}

const selectSession = async (session: ChatSession) => {
  selectedSessionId.value = session.id
  messageLoading.value = true

  try {
    messages.value = await listChatMessages(session.id)
  } catch (cause) {
    showErrorMessage(cause, '加载会话消息失败')
  } finally {
    messageLoading.value = false
  }
}

const openImprove = async (message: ChatMessage, index: number) => {
  const defaultKnowledgeBase = targetKnowledgeBases.value[0]

  form.messageId = message.id
  form.knowledgeBaseId = defaultKnowledgeBase?.id ?? ''
  form.documentId = ''
  form.title = findPreviousQuestion(index)
  form.content = message.content
  improveOpen.value = true

  if (form.knowledgeBaseId) {
    await loadDocuments(form.knowledgeBaseId)
  }
}

const loadDocuments = async (knowledgeBaseId: string) => {
  documents.value = []

  if (!knowledgeBaseId) {
    return
  }

  documentLoading.value = true

  try {
    documents.value = await listDocuments(knowledgeBaseId)
  } catch (cause) {
    showErrorMessage(cause, '加载文档列表失败')
  } finally {
    documentLoading.value = false
  }
}

const saveImprove = async () => {
  if (!form.knowledgeBaseId) {
    ElMessage.error('请选择目标知识库')
    return
  }

  if (!form.content.trim()) {
    ElMessage.error('请输入标注内容')
    return
  }

  improving.value = true

  try {
    const result = await improveChatMessage(form.messageId, {
      knowledgeBaseId: form.knowledgeBaseId,
      documentId: form.documentId || undefined,
      documentName: form.documentId ? undefined : '聊天补充知识',
      title: form.title || undefined,
      content: form.content,
    })
    const index = messages.value.findIndex((message) => message.id === result.message.id)

    if (index >= 0) {
      messages.value[index] = result.message
    }

    improveOpen.value = false
    ElMessage.success('已标注入库')
  } catch (cause) {
    showErrorMessage(cause, '标注入库失败')
  } finally {
    improving.value = false
  }
}

const findPreviousQuestion = (index: number) => {
  for (let i = index - 1; i >= 0; i -= 1) {
    const message = messages.value[i]

    if (message?.role === 'USER') {
      return message.content
    }
  }

  return selectedSession.value?.title ?? ''
}

const goParagraph = (knowledgeBaseId: string, documentId: string) => {
  router.push({
    name: 'paragraph',
    params: {
      knowledgeBaseId,
      documentId,
    },
  })
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
  <div class="flex min-h-0 flex-1 flex-col gap-5">
    <header class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div class="grid gap-1">
        <el-button class="w-fit" text @click="router.push({ name: 'agents' })">
          返回 Agent
        </el-button>
        <h1 class="m-0 text-[30px] font-bold text-(--zeta-ink)">聊天日志</h1>
        <p class="m-0 text-sm text-(--zeta-muted)">
          {{ agent?.name || 'Agent' }} 的历史会话与标注入库
        </p>
      </div>
      <el-button
        :disabled="!agent?.model"
        type="primary"
        @click="router.push({ name: 'agent-chat', params: { agentId } })"
      >
        进入聊天
      </el-button>
    </header>

    <section class="grid min-h-0 flex-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside class="flex min-h-0 flex-col rounded-lg border border-(--zeta-line) bg-(--zeta-panel)">
        <div class="border-b border-(--zeta-line-soft) px-4 py-3">
          <strong>会话记录</strong>
          <span class="ml-2 text-sm text-(--zeta-muted)">{{ currentSessions.length }}</span>
        </div>
        <div v-loading="loading" class="min-h-0 flex-1 overflow-auto p-2">
          <button
            v-for="session in currentSessions"
            :key="session.id"
            class="mb-1 w-full rounded-md border border-transparent px-3 py-2 text-left transition hover:bg-(--zeta-blue-soft)"
            :class="session.id === selectedSessionId ? 'bg-(--zeta-blue-soft) text-(--zeta-blue)' : 'text-(--zeta-ink)'"
            type="button"
            @click="selectSession(session)"
          >
            <strong class="block truncate text-sm">{{ session.title || '新会话' }}</strong>
            <span class="mt-1 block text-xs text-(--zeta-muted)">{{ formatTime(session.updatedAt) }}</span>
          </button>
          <el-empty v-if="!loading && currentSessions.length === 0" description="暂无聊天日志" />
        </div>
      </aside>

      <main class="flex min-h-0 flex-col rounded-lg border border-(--zeta-line) bg-(--zeta-panel)">
        <div class="border-b border-(--zeta-line-soft) px-5 py-4">
          <strong>{{ selectedSession?.title || '请选择会话' }}</strong>
        </div>
        <div v-loading="messageLoading" class="min-h-0 flex-1 overflow-auto p-5">
          <div v-if="messages.length > 0" class="mx-auto grid max-w-[960px] gap-4">
            <article
              v-for="(message, index) in messages"
              :key="message.id"
              class="rounded-lg border border-(--zeta-line-soft) p-4"
              :class="message.role === 'ASSISTANT' ? 'bg-white' : 'bg-(--zeta-surface)'"
            >
              <div class="mb-3 flex items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  <el-tag :type="message.role === 'ASSISTANT' ? 'primary' : 'info'" effect="light">
                    {{ message.role === 'ASSISTANT' ? 'AI 回答' : '用户问题' }}
                  </el-tag>
                  <span class="text-xs text-(--zeta-muted)">{{ formatTime(message.createdAt) }}</span>
                </div>
                <el-button
                  v-if="message.role === 'ASSISTANT'"
                  size="small"
                  type="primary"
                  plain
                  @click="openImprove(message, index)"
                >
                  标注入库
                </el-button>
              </div>

              <p class="m-0 whitespace-pre-wrap text-sm leading-7 text-(--zeta-content)">
                {{ message.content }}
              </p>

              <div v-if="message.improveRecords.length > 0" class="mt-4 flex flex-wrap items-center gap-2">
                <el-tag type="success" effect="light">已标注 {{ message.improveRecords.length }}</el-tag>
                <el-button
                  v-for="record in message.improveRecords"
                  :key="record.chunkId"
                  size="small"
                  text
                  type="primary"
                  @click="goParagraph(record.knowledgeBaseId, record.documentId)"
                >
                  {{ record.documentName }} / 分段 #{{ record.chunkPosition + 1 }}
                </el-button>
              </div>
            </article>
          </div>
          <el-empty v-else-if="!messageLoading" description="请选择左侧会话查看消息" />
        </div>
      </main>
    </section>

    <el-dialog v-model="improveOpen" title="标注入库" width="760px">
      <el-form label-position="top" @submit.prevent="saveImprove">
        <el-form-item label="目标知识库">
          <el-select
            v-model="form.knowledgeBaseId"
            placeholder="请选择知识库"
            @change="loadDocuments"
          >
            <el-option
              v-for="knowledgeBase in targetKnowledgeBases"
              :key="knowledgeBase.id"
              :label="knowledgeBase.name"
              :value="knowledgeBase.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="目标文档">
          <el-select
            v-model="form.documentId"
            :loading="documentLoading"
            placeholder="自动：聊天补充知识"
            clearable
          >
            <el-option label="自动：聊天补充知识" value="" />
            <el-option
              v-for="document in documents"
              :key="document.id"
              :label="document.name"
              :value="document.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="分段标题">
          <el-input v-model="form.title" maxlength="512" show-word-limit />
        </el-form-item>
        <el-form-item label="分段内容">
          <el-input v-model="form.content" :rows="10" type="textarea" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="improveOpen = false">取消</el-button>
        <el-button :loading="improving" type="primary" @click="saveImprove">
          保存并入库
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>
