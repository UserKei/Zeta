<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EyeIcon, PencilIcon, TrashIcon } from '@lucide/vue'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  deleteChatMessageImprove,
  improveChatMessage,
  listAgentChatSessionSummaries,
  listChatMessageImproves,
  listChatMessages,
  type ChatImproveRecord,
  type ChatImproveRecordDetail,
  type ChatMessage,
  type ChatSession,
  type ChatSessionSummary,
} from '@/apis/chat'
import { getAgent, type Agent } from '@/apis/agents'
import { listDocuments, updateDocumentChunk, type KnowledgeDocument } from '@/apis/knowledge-docs'
import { getErrorMessage } from '@/utils/feedback'
import ChatLogDetailSheet from './components/ChatLogDetailSheet.vue'

defineOptions({
  name: 'AgentChatLogsView',
})

type SessionRow = ChatSessionSummary
type NoticeState = {
  type: 'success' | 'error'
  title: string
  description?: string
}

const route = useRoute()
const router = useRouter()
const agentId = computed(() => route.params.agentId as string)
const agent = ref<Agent | null>(null)
const sessions = ref<ChatSessionSummary[]>([])
const messageCache = ref<Record<string, ChatMessage[]>>({})
const messages = ref<ChatMessage[]>([])
const documents = ref<KnowledgeDocument[]>([])
const selectedSessionId = ref('')
const searchText = ref('')
const markFilter = ref<'ALL' | 'MARKED' | 'UNMARKED'>('ALL')
const loading = ref(false)
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
const deleteMarkOpen = ref(false)
const deletingMarkRecord = ref<ChatImproveRecordDetail | null>(null)
const notice = ref<NoticeState | null>(null)
const AUTO_DOCUMENT_VALUE = '__AUTO_DOCUMENT__'

const form = reactive({
  messageId: '',
  knowledgeBaseId: '',
  documentId: '',
  title: '',
  content: '',
})

const currentSessions = computed(() => sessions.value)

const sessionRows = computed<SessionRow[]>(() => currentSessions.value.map((session) => session))

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

const documentSelectValue = computed({
  get: () => form.documentId || AUTO_DOCUMENT_VALUE,
  set: (value: string | number | null | undefined) => {
    const nextValue = String(value ?? '')
    form.documentId = nextValue === AUTO_DOCUMENT_VALUE ? '' : nextValue
  },
})

const showNotice = (type: NoticeState['type'], title: string, description?: string) => {
  notice.value = { type, title, description }
}

const showFailure = (cause: unknown, fallback: string) => {
  showNotice('error', fallback, getErrorMessage(cause, fallback))
}

const clearNotice = () => {
  notice.value = null
}

const load = async () => {
  loading.value = true

  try {
    const [agentDetail, sessionSummaries] = await Promise.all([
      getAgent(agentId.value),
      listAgentChatSessionSummaries(agentId.value),
    ])
    agent.value = agentDetail
    sessions.value = sessionSummaries
  } catch (cause) {
    showFailure(cause, '加载对话日志失败')
  } finally {
    loading.value = false
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
    showFailure(cause, '加载会话消息失败')
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

  sessions.value = sessions.value.map((session) =>
    session.id === sessionId
      ? {
          ...session,
          messageCount: sessionMessages.length,
          improveCount: countImproveRecords(sessionMessages),
        }
      : session,
  )
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

const trailingCitationLinePattern =
  /(?:^|\r?\n)\s*(?:引用|参考|参考来源|References?|Sources?)\s*[:：]\s*(?:(?:\[\s*\d+\s*\]|\d+)(?:\s*(?:[,，、;；]\s*)?(?:\[\s*\d+\s*\]|\d+))*)\s*$/i

const stripTrailingCitationLine = (content: string) =>
  content.replace(trailingCitationLinePattern, '').trimEnd()

const openImprove = async (message: ChatMessage, index: number) => {
  const defaultKnowledgeBase = targetKnowledgeBases.value[0]

  form.messageId = message.id
  form.knowledgeBaseId = defaultKnowledgeBase?.id ?? ''
  form.documentId = ''
  form.title = findPreviousQuestion(index)
  form.content = stripTrailingCitationLine(message.content)
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
    showFailure(cause, '加载文档列表失败')
  } finally {
    documentLoading.value = false
  }
}

const handleKnowledgeBaseChange = async (value: unknown) => {
  form.knowledgeBaseId = String(value ?? '')
  form.documentId = ''
  await loadDocuments(form.knowledgeBaseId)
}

const saveImprove = async () => {
  if (!form.knowledgeBaseId) {
    showNotice('error', '请选择目标知识库')
    return
  }

  if (!form.content.trim()) {
    showNotice('error', '请输入标注内容')
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
    showNotice('success', '已保存至知识库')
  } catch (cause) {
    showFailure(cause, '标注入库失败')
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
    showFailure(cause, '加载标注失败')
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
    showNotice('error', '请输入标注内容')
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
    showNotice('success', '标注已更新')
  } catch (cause) {
    showFailure(cause, '更新标注失败')
  } finally {
    markSaving.value = false
  }
}

const requestDeleteMark = (record: ChatImproveRecordDetail) => {
  if (!markMessage.value) {
    return
  }

  deletingMarkRecord.value = record
  deleteMarkOpen.value = true
}

const confirmDeleteMark = async () => {
  if (!markMessage.value || !deletingMarkRecord.value) {
    return
  }

  markSaving.value = true
  const record = deletingMarkRecord.value

  try {
    const result = await deleteChatMessageImprove(markMessage.value.id, record.chunkId)
    replaceMessage(result.message)
    markRecords.value = markRecords.value.filter((item) => item.chunkId !== record.chunkId)
    deleteMarkOpen.value = false
    deletingMarkRecord.value = null
    showNotice('success', '标注已删除')
  } catch (cause) {
    showFailure(cause, '删除标注失败')
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
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-4 lg:p-6">
    <Alert
      v-if="notice"
      :variant="notice.type === 'error' ? 'destructive' : 'default'"
      class="mb-4"
    >
      <AlertTitle>{{ notice.title }}</AlertTitle>
      <AlertDescription v-if="notice.description && notice.description !== notice.title">
        {{ notice.description }}
      </AlertDescription>
      <AlertAction>
        <Button type="button" variant="ghost" size="sm" @click="clearNotice">关闭</Button>
      </AlertAction>
    </Alert>

    <Card class="min-h-0 flex-1 gap-0 overflow-hidden py-0">
      <div
        class="flex flex-col gap-3 border-b border-border bg-muted/30 p-4 lg:flex-row lg:items-center lg:justify-between"
      >
        <div class="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
          <Input v-model="searchText" placeholder="搜索摘要" class="w-full md:max-w-70" />
          <Select v-model="markFilter">
            <SelectTrigger class="w-full md:max-w-45">
              <SelectValue placeholder="全部日志" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="ALL">全部日志</SelectItem>
                <SelectItem value="MARKED">已标注</SelectItem>
                <SelectItem value="UNMARKED">未标注</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
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
          <Button variant="outline" :disabled="loading" @click="load">
            {{ loading ? '刷新中' : '刷新' }}
          </Button>
        </div>
      </div>

      <CardContent class="min-h-0 flex-1 overflow-auto p-0">
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
            <TableRow v-if="loading">
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

    <ChatLogDetailSheet
      v-model:open="drawerOpen"
      :selected-session="selectedSession"
      :messages="messages"
      :message-loading="messageLoading"
      @open-mark="openMark"
      @view-improve="goImproveRecord"
      @save-improve="openImprove"
    />

    <Dialog v-model:open="improveOpen">
      <DialogContent class="sm:max-w-190">
        <DialogHeader>
          <DialogTitle>保存至文档</DialogTitle>
          <DialogDescription>将有价值的 AI 回答保存为知识库分段。</DialogDescription>
        </DialogHeader>

        <form class="grid gap-4" @submit.prevent="saveImprove">
          <div class="grid gap-2">
            <Label>目标知识库</Label>
            <Select v-model="form.knowledgeBaseId" @update:modelValue="handleKnowledgeBaseChange">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="请选择知识库" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem
                    v-for="knowledgeBase in targetKnowledgeBases"
                    :key="knowledgeBase.id"
                    :value="knowledgeBase.id"
                  >
                    {{ knowledgeBase.name }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div class="grid gap-2">
            <Label>保存至文档</Label>
            <Select v-model="documentSelectValue" :disabled="documentLoading">
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="documentLoading ? '文档加载中' : '自动：聊天补充知识'" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem :value="AUTO_DOCUMENT_VALUE">自动：聊天补充知识</SelectItem>
                  <SelectItem v-for="document in documents" :key="document.id" :value="document.id">
                    {{ document.name }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div class="grid gap-2">
            <Label for="chat-log-improve-title">标题</Label>
            <Input id="chat-log-improve-title" v-model="form.title" maxlength="512" />
          </div>

          <div class="grid gap-2">
            <Label for="chat-log-improve-content">内容</Label>
            <Textarea id="chat-log-improve-content" v-model="form.content" class="min-h-60" />
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" @click="improveOpen = false">取消</Button>
          <Button type="button" :disabled="improving" @click="saveImprove">
            {{ improving ? '保存中' : '保存' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="markOpen">
      <DialogContent class="sm:max-w-190">
        <DialogHeader>
          <DialogTitle>改进标注</DialogTitle>
          <DialogDescription>查看、编辑或删除这条回答已经保存的知识分段。</DialogDescription>
        </DialogHeader>

        <div v-if="markLoading || markSaving" class="grid gap-4">
          <Skeleton v-for="index in 2" :key="index" class="h-34 w-full" />
        </div>

        <div
          v-else-if="markRecords.length === 0"
          class="grid min-h-32 place-items-center text-sm text-muted-foreground"
        >
          暂无标注
        </div>

        <div v-else class="grid max-h-[65vh] gap-4 overflow-auto pr-1">
          <Card
            v-for="record in markRecords"
            :key="record.chunkId"
            class="gap-3 border-border p-4 shadow-none"
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="grid gap-1">
                <strong>{{ record.documentName }}</strong>
                <span class="text-xs text-muted-foreground">
                  分段 #{{ record.chunkPosition + 1 }} · {{ formatTime(record.createdAt) }}
                </span>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  @click="goParagraph(record.knowledgeBaseId, record.documentId, record.chunkId)"
                >
                  <EyeIcon data-icon="inline-start" />
                  查看分段
                </Button>
                <Button type="button" variant="outline" size="sm" @click="startEditMark(record)">
                  <PencilIcon data-icon="inline-start" />
                  编辑
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  @click="requestDeleteMark(record)"
                >
                  <TrashIcon data-icon="inline-start" />
                  删除
                </Button>
              </div>
            </div>

            <template v-if="markEditingId === record.chunkId">
              <Textarea v-model="markEditingContent" class="min-h-48" />
              <div class="flex justify-end gap-2">
                <Button type="button" variant="outline" @click="cancelEditMark">取消</Button>
                <Button type="button" :disabled="markSaving" @click="saveMarkEdit(record)">
                  {{ markSaving ? '保存中' : '保存' }}
                </Button>
              </div>
            </template>
            <p v-else class="whitespace-pre-wrap text-sm leading-7 text-foreground">
              {{ record.content }}
            </p>
          </Card>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog v-model:open="deleteMarkOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除标注</AlertDialogTitle>
          <AlertDialogDescription>
            删除后会同步删除对应分段和向量索引，确认继续？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="markSaving">取消</AlertDialogCancel>
          <AlertDialogAction :disabled="markSaving" @click="confirmDeleteMark">
            {{ markSaving ? '删除中' : '删除' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
