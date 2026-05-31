<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Delete, EditPen, View } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  deleteChatMessageImprove,
  improveChatMessage,
  listChatMessageImproves,
  listChatMessages,
  listChatSessions,
  type ChatImproveRecord,
  type ChatImproveRecordDetail,
  type ChatMessage,
  type ChatSession,
} from '@/apis/chat'
import { getAgent, type Agent } from '@/apis/agents'
import { listDocuments, updateDocumentChunk, type KnowledgeDocument } from '@/apis/knowledge-docs'
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
    const matchKeyword = !keyword || (session.title || '新会话').toLowerCase().includes(keyword)
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
    await loadSessionStats(sessionList.filter((session) => session.agentId === agentId.value))
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

const setSessionMessages = (sessionId: string, sessionMessages: ChatMessage[]) => {
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
  sessionMessages.reduce((total, message) => total + message.improveRecords.length, 0)

const latestImproveRecord = (message: ChatMessage) => message.improveRecords.at(-1) ?? null

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
    await ElMessageBox.confirm('删除后会同步删除对应分段和向量索引，确认继续？', '删除标注', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch (cause) {
    if (!isCancelAction(cause)) {
      showErrorMessage(cause, '删除标注失败')
    }
    return
  }

  markSaving.value = true

  try {
    const result = await deleteChatMessageImprove(markMessage.value.id, record.chunkId)
    replaceMessage(result.message)
    markRecords.value = markRecords.value.filter((item) => item.chunkId !== record.chunkId)
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

const goParagraph = (knowledgeBaseId: string, documentId: string, chunkId?: string) => {
  router.push({
    name: 'paragraph',
    params: {
      knowledgeBaseId,
      documentId,
    },
    query: chunkId ? { chunkId } : undefined,
  })
}

const goImproveRecord = (record: ChatImproveRecord) => {
  goParagraph(record.knowledgeBaseId, record.documentId, record.chunkId)
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
  <div class="flex min-h-0 flex-1 flex-col p-4 lg:p-6">
    <Card class="gap-0 overflow-hidden py-0">
      <div
        class="flex flex-col gap-3 border-b border-border bg-muted/30 p-4 lg:flex-row lg:items-center lg:justify-between"
      >
        <div class="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
          <Input v-model="searchText" placeholder="搜索摘要" class="w-full md:max-w-70" />
          <select
            v-model="markFilter"
            class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:max-w-45"
          >
            <option value="ALL">全部日志</option>
            <option value="MARKED">已标注</option>
            <option value="UNMARKED">未标注</option>
          </select>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>会话 {{ sessionRows.length }}</span>
          <span>标注 {{ totalImproveCount }}</span>
          <Button
            :disabled="!agent?.model"
            @click="router.push({ name: 'agent-chat', params: { agentId } })"
          >
            在线使用
          </Button>
          <Button variant="outline" :disabled="loading || summaryLoading" @click="load">
            {{ loading || summaryLoading ? '刷新中' : '刷新' }}
          </Button>
        </div>
      </div>

      <CardContent class="p-5">
        <Table>
          <TableHeader>
            <TableRow class="bg-muted/60 hover:bg-muted/60">
              <TableHead class="w-[45%] min-w-70">摘要</TableHead>
              <TableHead class="w-24 text-right">消息数</TableHead>
              <TableHead class="w-28 text-right">改进标注</TableHead>
              <TableHead class="w-40">最近对话时间</TableHead>
              <TableHead class="w-24 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="loading || summaryLoading">
              <TableCell colspan="5" class="h-24 text-center text-muted-foreground">
                正在加载对话日志...
              </TableCell>
            </TableRow>
            <TableRow v-else-if="filteredSessionRows.length === 0">
              <TableCell colspan="5" class="h-24 text-center text-muted-foreground">
                暂无对话日志
              </TableCell>
            </TableRow>
            <template v-else>
              <TableRow
                v-for="session in filteredSessionRows"
                :key="session.id"
                class="cursor-pointer"
                @click="openSession(session)"
              >
                <TableCell>
                  <strong class="font-semibold text-foreground">
                    {{ session.title || '新会话' }}
                  </strong>
                </TableCell>
                <TableCell class="text-right text-muted-foreground">
                  {{ session.messageCount }}
                </TableCell>
                <TableCell class="text-right">
                  <Badge v-if="session.improveCount > 0">
                    {{ session.improveCount }}
                  </Badge>
                  <span v-else class="text-muted-foreground">-</span>
                </TableCell>
                <TableCell class="text-muted-foreground">
                  {{ formatTime(session.updatedAt) }}
                </TableCell>
                <TableCell>
                  <div class="flex justify-end">
                    <Button variant="outline" size="sm" @click.stop="openSession(session)">
                      查看
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

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
              <el-tag v-if="message.improveRecords.length > 0" type="success" effect="light">
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
                v-if="latestImproveRecord(message)"
                size="small"
                type="primary"
                plain
                @click="goImproveRecord(latestImproveRecord(message)!)"
              >
                查看分段
              </el-button>
              <el-button size="small" type="primary" plain @click="openImprove(message, index)">
                保存至文档
              </el-button>
            </div>
          </div>

          <p class="m-0 whitespace-pre-wrap text-sm leading-7 text-(--zeta-content)">
            {{ message.content }}
          </p>

          <div
            v-if="latestImproveRecord(message)"
            class="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-(--zeta-blue-line) bg-(--zeta-blue-soft) px-3 py-2 text-sm text-(--zeta-content)"
          >
            <el-tag type="success" effect="light" size="small">
              已标注 {{ message.improveRecords.length }}
            </el-tag>
            <span class="font-medium">
              {{ latestImproveRecord(message)!.documentName }}
            </span>
            <span class="text-(--zeta-muted)">
              分段 #{{ latestImproveRecord(message)!.chunkPosition + 1 }}
            </span>
            <el-button link type="primary" @click="goImproveRecord(latestImproveRecord(message)!)">
              查看分段
            </el-button>
          </div>
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
        <el-button :loading="improving" type="primary" @click="saveImprove"> 保存 </el-button>
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
                @click="goParagraph(record.knowledgeBaseId, record.documentId, record.chunkId)"
              >
                查看分段
              </el-button>
              <el-button size="small" :icon="EditPen" @click="startEditMark(record)">
                编辑
              </el-button>
              <el-button size="small" type="danger" :icon="Delete" @click="deleteMark(record)">
                删除
              </el-button>
            </div>
          </div>

          <template v-if="markEditingId === record.chunkId">
            <el-input v-model="markEditingContent" :rows="8" type="textarea" />
            <div class="mt-3 flex justify-end gap-2">
              <el-button @click="cancelEditMark">取消</el-button>
              <el-button :loading="markSaving" type="primary" @click="saveMarkEdit(record)">
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
