<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Delete, EditPen, View } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  deleteChatMessageImprove,
  improveChatMessage,
  listChatMessageImproves,
  listChatMessages,
  listChatSessions,
  type ChatImproveRecordDetail,
  type ChatMessage,
  type ChatSession,
} from '@/apis/chat'
import { getAgent, type Agent } from '@/apis/agents'
import {
  listDocuments,
  updateDocumentChunk,
  type KnowledgeDocument,
} from '@/apis/knowledge-docs'
import { isCancelAction, showErrorMessage } from '@/utils/feedback'

defineOptions({
  name: 'AgentChatLogsView',
})

type SessionStats = {
  messageCount: number
  improveCount: number
}

type SessionRow = ChatSession & SessionStats

const route = useRoute()
const router = useRouter()
const agentId = computed(() => route.params.agentId as string)
const agent = ref<Agent | null>(null)
const sessions = ref<ChatSession[]>([])
const sessionStats = ref<Record<string, SessionStats>>({})
const messageCache = ref<Record<string, ChatMessage[]>>({})
const messages = ref<ChatMessage[]>([])
const documents = ref<KnowledgeDocument[]>([])
const selectedSessionId = ref('')
const searchText = ref('')
const markFilter = ref<'ALL' | 'MARKED' | 'UNMARKED'>('ALL')
const loading = ref(false)
const summaryLoading = ref(false)
const messageLoading = ref(false)
const documentLoading = ref(false)
const drawerOpen = ref(false)
const improveOpen = ref(false)
const improving = ref(false)
const markOpen = ref(false)
const markLoading = ref(false)
const markSaving = ref(false)
const markEditingId = ref('')
const markEditingContent = ref('')
const markRecords = ref<ChatImproveRecordDetail[]>([])
const markMessage = ref<ChatMessage | null>(null)

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

const sessionRows = computed<SessionRow[]>(() =>
  currentSessions.value.map((session) => ({
    ...session,
    messageCount: sessionStats.value[session.id]?.messageCount ?? 0,
    improveCount: sessionStats.value[session.id]?.improveCount ?? 0,
  })),
)

const filteredSessionRows = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()

  return sessionRows.value.filter((session) => {
    const matchKeyword =
      !keyword || (session.title || '新会话').toLowerCase().includes(keyword)
    const matchMark =
      markFilter.value === 'ALL' ||
      (markFilter.value === 'MARKED' && session.improveCount > 0) ||
      (markFilter.value === 'UNMARKED' && session.improveCount === 0)

    return matchKeyword && matchMark
  })
})

const targetKnowledgeBases = computed(
  () => agent.value?.knowledgeBases.filter((item) => item.status === 'ACTIVE') ?? [],
)

const selectedSession = computed(() =>
  currentSessions.value.find((session) => session.id === selectedSessionId.value),
)

const totalImproveCount = computed(() =>
  sessionRows.value.reduce((total, session) => total + session.improveCount, 0),
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
    await loadSessionStats(
      sessionList.filter((session) => session.agentId === agentId.value),
    )
  } catch (cause) {
    showErrorMessage(cause, '加载对话日志失败')
  } finally {
    loading.value = false
  }
}

const loadSessionStats = async (agentSessions: ChatSession[]) => {
  summaryLoading.value = true

  try {
    const entries = await Promise.all(
      agentSessions.map(async (session) => {
        const sessionMessages = await listChatMessages(session.id)
        messageCache.value = {
          ...messageCache.value,
          [session.id]: sessionMessages,
        }

        return [
          session.id,
          {
            messageCount: sessionMessages.length,
            improveCount: countImproveRecords(sessionMessages),
          },
        ] as const
      }),
    )

    sessionStats.value = Object.fromEntries(entries)
  } catch (cause) {
    showErrorMessage(cause, '加载日志统计失败')
  } finally {
    summaryLoading.value = false
  }
}

const openSession = async (session: ChatSession) => {
  selectedSessionId.value = session.id
  drawerOpen.value = true
  await loadMessages(session.id)
}

const loadMessages = async (sessionId: string, force = false) => {
  const cachedMessages = messageCache.value[sessionId]

  if (cachedMessages && !force) {
    messages.value = cachedMessages
    return
  }

  messageLoading.value = true

  try {
    const sessionMessages = await listChatMessages(sessionId)
    setSessionMessages(sessionId, sessionMessages)
  } catch (cause) {
    showErrorMessage(cause, '加载会话消息失败')
  } finally {
    messageLoading.value = false
  }
}

const setSessionMessages = (
  sessionId: string,
  sessionMessages: ChatMessage[],
) => {
  messageCache.value = {
    ...messageCache.value,
    [sessionId]: sessionMessages,
  }

  if (selectedSessionId.value === sessionId) {
    messages.value = sessionMessages
  }

  sessionStats.value = {
    ...sessionStats.value,
    [sessionId]: {
      messageCount: sessionMessages.length,
      improveCount: countImproveRecords(sessionMessages),
    },
  }
}

const replaceMessage = (message: ChatMessage) => {
  if (!selectedSessionId.value) {
    return
  }

  const nextMessages = (messageCache.value[selectedSessionId.value] ?? messages.value).map(
    (item) => (item.id === message.id ? message : item),
  )
  setSessionMessages(selectedSessionId.value, nextMessages)
}

const countImproveRecords = (sessionMessages: ChatMessage[]) =>
  sessionMessages.reduce(
    (total, message) => total + message.improveRecords.length,
    0,
  )

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

    replaceMessage(result.message)
    improveOpen.value = false
    ElMessage.success('已保存至知识库')
  } catch (cause) {
    showErrorMessage(cause, '标注入库失败')
  } finally {
    improving.value = false
  }
}

const openMark = async (message: ChatMessage) => {
  markMessage.value = message
  markOpen.value = true
  markEditingId.value = ''
  markEditingContent.value = ''
  await loadMarks(message.id)
}

const loadMarks = async (messageId: string) => {
  markLoading.value = true

  try {
    markRecords.value = await listChatMessageImproves(messageId)
  } catch (cause) {
    showErrorMessage(cause, '加载标注失败')
  } finally {
    markLoading.value = false
  }
}

const startEditMark = (record: ChatImproveRecordDetail) => {
  markEditingId.value = record.chunkId
  markEditingContent.value = record.content
}

const cancelEditMark = () => {
  markEditingId.value = ''
  markEditingContent.value = ''
}

const saveMarkEdit = async (record: ChatImproveRecordDetail) => {
  if (!markEditingContent.value.trim()) {
    ElMessage.error('请输入标注内容')
    return
  }

  markSaving.value = true

  try {
    const updated = await updateDocumentChunk(record.chunkId, {
      content: markEditingContent.value,
    })
    markRecords.value = markRecords.value.map((item) =>
      item.chunkId === record.chunkId
        ? {
            ...item,
            content: updated.content,
          }
        : item,
    )
    cancelEditMark()
    ElMessage.success('标注已更新')
  } catch (cause) {
    showErrorMessage(cause, '更新标注失败')
  } finally {
    markSaving.value = false
  }
}

const deleteMark = async (record: ChatImproveRecordDetail) => {
  if (!markMessage.value) {
    return
  }

  try {
    await ElMessageBox.confirm(
      '删除后会同步删除对应分段和向量索引，确认继续？',
      '删除标注',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    )
  } catch (cause) {
    if (!isCancelAction(cause)) {
      showErrorMessage(cause, '删除标注失败')
    }
    return
  }

  markSaving.value = true

  try {
    const result = await deleteChatMessageImprove(
      markMessage.value.id,
      record.chunkId,
    )
    replaceMessage(result.message)
    markRecords.value = markRecords.value.filter(
      (item) => item.chunkId !== record.chunkId,
    )
    ElMessage.success('标注已删除')
  } catch (cause) {
    showErrorMessage(cause, '删除标注失败')
  } finally {
    markSaving.value = false
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
        <h1 class="m-0 text-[30px] font-bold text-(--zeta-ink)">对话日志</h1>
        <p class="m-0 text-sm text-(--zeta-muted)">
          {{ agent?.name || 'Agent' }} 的历史会话、改进标注和知识入库记录
        </p>
      </div>
      <el-button
        :disabled="!agent?.model"
        type="primary"
        @click="router.push({ name: 'agent-chat', params: { agentId } })"
      >
        在线使用
      </el-button>
    </header>

    <el-card class="min-h-0 flex-1" body-class="flex h-full min-h-0 flex-col gap-4">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
          <el-input
            v-model="searchText"
            class="max-w-[280px]"
            clearable
            placeholder="搜索摘要"
          />
          <el-select v-model="markFilter" class="max-w-[180px]">
            <el-option label="全部日志" value="ALL" />
            <el-option label="已标注" value="MARKED" />
            <el-option label="未标注" value="UNMARKED" />
          </el-select>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-sm text-(--zeta-muted)">
          <span>会话 {{ sessionRows.length }}</span>
          <span>标注 {{ totalImproveCount }}</span>
          <el-button :loading="loading || summaryLoading" @click="load">刷新</el-button>
        </div>
      </div>

      <el-table
        v-loading="loading || summaryLoading"
        class="min-h-0 flex-1"
        :data="filteredSessionRows"
        row-key="id"
        @row-click="openSession"
      >
        <el-table-column label="摘要" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">
            <strong>{{ row.title || '新会话' }}</strong>
          </template>
        </el-table-column>
        <el-table-column
          align="right"
          label="对话提问数"
          prop="messageCount"
          width="130"
        />
        <el-table-column align="right" label="改进标注" prop="improveCount" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.improveCount > 0" type="success" effect="light">
              {{ row.improveCount }}
            </el-tag>
            <span v-else class="text-(--zeta-muted)">-</span>
          </template>
        </el-table-column>
        <el-table-column label="最近对话时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.updatedAt) }}
          </template>
        </el-table-column>
        <el-table-column align="right" label="操作" width="110">
          <template #default="{ row }">
            <el-button text type="primary" @click.stop="openSession(row)">
              查看
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-drawer v-model="drawerOpen" size="64%" destroy-on-close>
      <template #header>
        <div class="grid gap-1">
          <h2 class="m-0 text-xl font-semibold text-(--zeta-ink)">对话详情</h2>
          <span class="text-sm text-(--zeta-muted)">
            {{ selectedSession?.title || '新会话' }}
          </span>
        </div>
      </template>

      <div v-loading="messageLoading" class="flex min-h-0 flex-col gap-4">
        <article
          v-for="(message, index) in messages"
          :key="message.id"
          class="rounded-lg border border-(--zeta-line-soft) p-4"
          :class="message.role === 'ASSISTANT' ? 'bg-white' : 'bg-(--zeta-surface)'"
        >
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <el-tag :type="message.role === 'ASSISTANT' ? 'primary' : 'info'" effect="light">
                {{ message.role === 'ASSISTANT' ? 'AI 回答' : '用户问题' }}
              </el-tag>
              <span class="text-xs text-(--zeta-muted)">{{ formatTime(message.createdAt) }}</span>
              <el-tag
                v-if="message.improveRecords.length > 0"
                type="success"
                effect="light"
              >
                已标注 {{ message.improveRecords.length }}
              </el-tag>
            </div>
            <div v-if="message.role === 'ASSISTANT'" class="flex items-center gap-2">
              <el-button
                v-if="message.improveRecords.length > 0"
                size="small"
                :icon="View"
                @click="openMark(message)"
              >
                改进标注
              </el-button>
              <el-button
                size="small"
                type="primary"
                plain
                @click="openImprove(message, index)"
              >
                保存至文档
              </el-button>
            </div>
          </div>

          <p class="m-0 whitespace-pre-wrap text-sm leading-7 text-(--zeta-content)">
            {{ message.content }}
          </p>
        </article>

        <el-empty v-if="!messageLoading && messages.length === 0" description="暂无消息" />
      </div>
    </el-drawer>

    <el-dialog v-model="improveOpen" title="保存至文档" width="760px">
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
        <el-form-item label="保存至文档">
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
        <el-form-item label="标题">
          <el-input v-model="form.title" maxlength="512" show-word-limit />
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="form.content" :rows="10" type="textarea" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="improveOpen = false">取消</el-button>
        <el-button :loading="improving" type="primary" @click="saveImprove">
          保存
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="markOpen" title="改进标注" width="760px">
      <div v-loading="markLoading || markSaving" class="grid gap-4">
        <section
          v-for="record in markRecords"
          :key="record.chunkId"
          class="rounded-lg border border-(--zeta-line-soft) p-4"
        >
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div class="grid gap-1">
              <strong>{{ record.documentName }}</strong>
              <span class="text-xs text-(--zeta-muted)">
                分段 #{{ record.chunkPosition + 1 }} · {{ formatTime(record.createdAt) }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <el-button
                size="small"
                :icon="View"
                @click="goParagraph(record.knowledgeBaseId, record.documentId)"
              >
                查看分段
              </el-button>
              <el-button
                size="small"
                :icon="EditPen"
                @click="startEditMark(record)"
              >
                编辑
              </el-button>
              <el-button
                size="small"
                type="danger"
                :icon="Delete"
                @click="deleteMark(record)"
              >
                删除
              </el-button>
            </div>
          </div>

          <template v-if="markEditingId === record.chunkId">
            <el-input
              v-model="markEditingContent"
              :rows="8"
              type="textarea"
            />
            <div class="mt-3 flex justify-end gap-2">
              <el-button @click="cancelEditMark">取消</el-button>
              <el-button
                :loading="markSaving"
                type="primary"
                @click="saveMarkEdit(record)"
              >
                保存
              </el-button>
            </div>
          </template>
          <p v-else class="m-0 whitespace-pre-wrap text-sm leading-7 text-(--zeta-content)">
            {{ record.content }}
          </p>
        </section>

        <el-empty v-if="!markLoading && markRecords.length === 0" description="暂无标注" />
      </div>
    </el-dialog>
  </div>
</template>
