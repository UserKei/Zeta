<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
  createAgent,
  deleteAgent,
  listAgents,
  updateAgent,
  type Agent,
  type AgentPayload,
  type AgentStatus,
} from '@/apis/agents'
import { listModels, type AiModel } from '@/apis/models'
import { listKnowledgeBases, type KnowledgeBase } from '@/apis/knowledge-bases'
import { showErrorMessage } from '@/utils/feedback'

defineOptions({
  name: 'AgentsView',
})

const router = useRouter()
const agents = ref<Agent[]>([])
const models = ref<AiModel[]>([])
const knowledgeBases = ref<KnowledgeBase[]>([])
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const editingId = ref<string | null>(null)
const formOpen = ref(false)
const deleteOpen = ref(false)
const deletingAgent = ref<Agent | null>(null)

const form = reactive<AgentPayload>({
  name: '',
  description: '',
  modelId: '',
  knowledgeBaseIds: [],
  systemPrompt: '你是企业知识库专家，请基于知识库上下文回答问题，并在回答末尾列出引用。',
  openingMessage: '你好，我可以基于已绑定知识库回答问题。',
  status: 'PUBLISHED',
  temperature: 0.2,
  topP: 0.8,
})

const chatModels = computed(() =>
  models.value.filter((model) => model.type === 'CHAT' && model.isEnabled),
)

const activeKnowledgeBases = computed(() =>
  knowledgeBases.value.filter(
    (knowledgeBase) => knowledgeBase.status === 'ACTIVE' && knowledgeBase.embeddingModel,
  ),
)

const title = computed(() => (editingId.value ? '编辑 Agent' : '创建 Agent'))

const descriptionValue = computed({
  get: () => form.description ?? '',
  set: (value: string) => {
    form.description = value
  },
})

const openingMessageValue = computed({
  get: () => form.openingMessage ?? '',
  set: (value: string) => {
    form.openingMessage = value
  },
})

const temperatureValue = computed<string | number>({
  get: () => form.temperature ?? '',
  set: (value) => {
    form.temperature = value === '' ? null : Number(value)
  },
})

const topPValue = computed<string | number>({
  get: () => form.topP ?? '',
  set: (value) => {
    form.topP = value === '' ? null : Number(value)
  },
})

const load = async () => {
  loading.value = true

  try {
    const [agentList, modelList, knowledgeBaseList] = await Promise.all([
      listAgents(),
      listModels(),
      listKnowledgeBases(),
    ])
    agents.value = agentList
    models.value = modelList
    knowledgeBases.value = knowledgeBaseList
  } catch (cause) {
    showErrorMessage(cause, '加载 Agent 失败')
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  editingId.value = null
  Object.assign(form, {
    name: '',
    description: '',
    modelId: chatModels.value[0]?.id ?? '',
    knowledgeBaseIds: activeKnowledgeBases.value[0] ? [activeKnowledgeBases.value[0].id] : [],
    systemPrompt: '你是企业知识库专家，请基于知识库上下文回答问题，并在回答末尾列出引用。',
    openingMessage: '你好，我可以基于已绑定知识库回答问题。',
    status: 'PUBLISHED' as AgentStatus,
    temperature: 0.2,
    topP: 0.8,
  })
  formOpen.value = true
}

const openEdit = (agent: Agent) => {
  editingId.value = agent.id
  Object.assign(form, {
    name: agent.name,
    description: agent.description ?? '',
    modelId: agent.modelId ?? '',
    knowledgeBaseIds: agent.knowledgeBases.map((knowledgeBase) => knowledgeBase.id),
    systemPrompt: agent.systemPrompt,
    openingMessage: agent.openingMessage ?? '',
    status: agent.status,
    temperature: agent.temperature,
    topP: agent.topP,
  })
  formOpen.value = true
}

const save = async () => {
  saving.value = true

  try {
    const payload = {
      ...form,
      description: form.description || undefined,
      openingMessage: form.openingMessage || undefined,
      temperature: normalizeOptionalNumber(form.temperature),
      topP: normalizeOptionalNumber(form.topP),
    }
    const saved = editingId.value
      ? await updateAgent(editingId.value, payload)
      : await createAgent(payload)
    const index = agents.value.findIndex((agent) => agent.id === saved.id)

    if (index >= 0) {
      agents.value[index] = saved
    } else {
      agents.value.unshift(saved)
    }

    formOpen.value = false
  } catch (cause) {
    showErrorMessage(cause, '保存 Agent 失败')
  } finally {
    saving.value = false
  }
}

const remove = (agent: Agent) => {
  deletingAgent.value = agent
  deleteOpen.value = true
}

const confirmRemove = async () => {
  if (!deletingAgent.value) {
    return
  }

  deleting.value = true

  try {
    await deleteAgent(deletingAgent.value.id)
    agents.value = agents.value.filter((item) => item.id !== deletingAgent.value?.id)
    deleteOpen.value = false
    deletingAgent.value = null
  } catch (cause) {
    showErrorMessage(cause, '删除 Agent 失败')
  } finally {
    deleting.value = false
  }
}

const toggleKnowledgeBase = (knowledgeBaseId: string, checked: boolean | 'indeterminate') => {
  if (checked === true) {
    if (!form.knowledgeBaseIds.includes(knowledgeBaseId)) {
      form.knowledgeBaseIds.push(knowledgeBaseId)
    }

    return
  }

  form.knowledgeBaseIds = form.knowledgeBaseIds.filter((id) => id !== knowledgeBaseId)
}

const normalizeOptionalNumber = (value: unknown) => {
  if (value === '' || value === null || value === undefined) {
    return null
  }

  return Number(value)
}

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const statusText = (status: AgentStatus) =>
  ({
    DRAFT: '草稿',
    PUBLISHED: '已发布',
    DISABLED: '停用',
  })[status]

const statusBadgeVariant = (status: AgentStatus) => {
  if (status === 'PUBLISHED') {
    return 'default'
  }

  if (status === 'DRAFT') {
    return 'secondary'
  }

  return 'outline'
}

onMounted(load)
</script>

<template>
  <Card class="m-4 gap-4 overflow-hidden p-4 lg:m-6 lg:p-6">
    <CardHeader
      class="flex flex-col items-start justify-between gap-4 px-0 pt-0 lg:flex-row lg:items-center"
    >
      <div>
        <CardTitle class="text-[34px] font-bold text-foreground">专家 Agent</CardTitle>
      </div>
      <Button @click="openCreate">创建 Agent</Button>
    </CardHeader>

    <Alert
      v-if="chatModels.length === 0 || activeKnowledgeBases.length === 0"
      class="border-border bg-muted/40 text-muted-foreground"
    >
      <AlertDescription>
        创建 Agent 需要至少一个启用的对话模型和一个启用的知识库。
      </AlertDescription>
    </Alert>

    <CardContent class="min-w-0 overflow-hidden rounded-lg border border-border p-0">
      <Table>
        <TableHeader>
          <TableRow class="bg-muted/60 hover:bg-muted/60">
            <TableHead class="min-w-60">名称</TableHead>
            <TableHead class="min-w-55">模型</TableHead>
            <TableHead class="min-w-60">绑定知识库</TableHead>
            <TableHead class="min-w-24">状态</TableHead>
            <TableHead class="min-w-36">更新时间</TableHead>
            <TableHead class="min-w-64 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="loading">
            <TableCell colspan="6" class="h-24 text-center text-muted-foreground">
              正在加载 Agent...
            </TableCell>
          </TableRow>
          <TableRow v-else-if="agents.length === 0">
            <TableCell colspan="6" class="h-24 text-center text-muted-foreground">
              还没有 Agent
            </TableCell>
          </TableRow>
          <template v-else>
            <TableRow v-for="agent in agents" :key="agent.id">
              <TableCell>
                <div class="grid gap-1">
                  <strong class="font-semibold text-foreground">{{ agent.name }}</strong>
                  <small class="text-muted-foreground">
                    {{ agent.description || agent.openingMessage || '暂无描述' }}
                  </small>
                </div>
              </TableCell>
              <TableCell>
                <div v-if="agent.model" class="grid gap-1">
                  <strong class="font-semibold text-foreground">{{ agent.model.name }}</strong>
                  <small class="text-muted-foreground">
                    {{ agent.model.provider }} / {{ agent.model.modelName }}
                  </small>
                </div>
                <div v-else class="grid gap-1">
                  <Badge variant="outline"> 未配置对话模型 </Badge>
                  <small class="text-muted-foreground">请编辑 Agent 重新选择模型</small>
                </div>
              </TableCell>
              <TableCell>
                <div class="grid gap-1">
                  <strong class="font-semibold text-foreground">
                    {{ agent.knowledgeBases.length }} 个知识库
                  </strong>
                  <small class="text-muted-foreground">
                    {{ agent.knowledgeBases.map((item) => item.name).join('、') || '未绑定' }}
                  </small>
                </div>
              </TableCell>
              <TableCell>
                <Badge :variant="statusBadgeVariant(agent.status)">
                  {{ statusText(agent.status) }}
                </Badge>
              </TableCell>
              <TableCell class="text-muted-foreground">
                {{ formatTime(agent.updatedAt) }}
              </TableCell>
              <TableCell>
                <div class="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="!agent.model"
                    @click="router.push({ name: 'agent-chat', params: { agentId: agent.id } })"
                  >
                    聊天
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    @click="router.push({ name: 'agent-chat-logs', params: { agentId: agent.id } })"
                  >
                    日志
                  </Button>
                  <Button variant="outline" size="sm" @click="openEdit(agent)">编辑</Button>
                  <Button variant="destructive" size="sm" @click="remove(agent)">删除</Button>
                </div>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
    </CardContent>

    <Dialog v-model:open="formOpen">
      <DialogContent class="sm:max-w-190">
        <DialogHeader>
          <DialogTitle>{{ title }}</DialogTitle>
          <DialogDescription>
            设置 Agent 的对话模型、绑定知识库、开场白和系统提示词。
          </DialogDescription>
        </DialogHeader>

        <form class="grid grid-cols-1 gap-3.5 md:grid-cols-2" @submit.prevent="save">
          <div class="grid gap-2">
            <Label for="agent-name">Agent 名称</Label>
            <Input id="agent-name" v-model="form.name" />
          </div>

          <div class="grid gap-2">
            <Label>状态</Label>
            <Select v-model="form.status">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="请选择状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="DRAFT">草稿</SelectItem>
                  <SelectItem value="PUBLISHED">已发布</SelectItem>
                  <SelectItem value="DISABLED">停用</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div class="grid gap-2 md:col-span-2">
            <Label for="agent-description">描述</Label>
            <Textarea
              id="agent-description"
              v-model="descriptionValue"
              placeholder="例如：IT 服务台、采购制度专家"
              class="min-h-20"
            />
          </div>

          <div class="grid gap-2 md:col-span-2">
            <Label>对话模型</Label>
            <Select v-model="form.modelId" :disabled="chatModels.length === 0">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="请选择对话模型" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="model in chatModels" :key="model.id" :value="model.id">
                    {{ model.name }} - {{ model.provider }} / {{ model.modelName }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div class="grid gap-2 md:col-span-2">
            <Label>绑定知识库</Label>
            <div
              class="grid max-h-44 gap-2 overflow-auto rounded-lg border border-border bg-background p-3"
            >
              <label
                v-for="knowledgeBase in activeKnowledgeBases"
                :key="knowledgeBase.id"
                class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  :checked="form.knowledgeBaseIds.includes(knowledgeBase.id)"
                  :disabled="activeKnowledgeBases.length === 0"
                  @update:checked="toggleKnowledgeBase(knowledgeBase.id, $event)"
                />
                <span class="font-medium text-foreground">{{ knowledgeBase.name }}</span>
              </label>
              <p
                v-if="activeKnowledgeBases.length === 0"
                class="px-2 py-1.5 text-sm text-muted-foreground"
              >
                还没有可绑定的启用知识库
              </p>
            </div>
          </div>

          <div class="grid gap-2">
            <Label for="agent-temperature">Temperature</Label>
            <Input
              id="agent-temperature"
              v-model.number="temperatureValue"
              type="number"
              min="0"
              max="2"
              step="0.1"
            />
          </div>

          <div class="grid gap-2">
            <Label for="agent-top-p">Top P</Label>
            <Input
              id="agent-top-p"
              v-model.number="topPValue"
              type="number"
              min="0"
              max="1"
              step="0.1"
            />
          </div>

          <div class="grid gap-2 md:col-span-2">
            <Label for="agent-opening-message">开场白</Label>
            <Textarea id="agent-opening-message" v-model="openingMessageValue" class="min-h-24" />
          </div>

          <div class="grid gap-2 md:col-span-2">
            <Label for="agent-system-prompt">Prompt</Label>
            <Textarea id="agent-system-prompt" v-model="form.systemPrompt" class="min-h-44" />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" @click="formOpen = false">取消</Button>
          <Button
            :disabled="chatModels.length === 0 || activeKnowledgeBases.length === 0 || saving"
            @click="save"
          >
            {{ saving ? '保存中' : '保存' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog v-model:open="deleteOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除 Agent</AlertDialogTitle>
          <AlertDialogDescription>
            确定删除 Agent「{{ deletingAgent?.name }}」？相关会话和绑定关系会同步清理。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="deleting">取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            :disabled="deleting"
            @click.prevent="confirmRemove"
          >
            {{ deleting ? '删除中' : '删除' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </Card>
</template>
