<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { isCancelAction, showErrorMessage } from '@/utils/feedback'

defineOptions({
  name: 'AgentsView',
})

const router = useRouter()
const agents = ref<Agent[]>([])
const models = ref<AiModel[]>([])
const knowledgeBases = ref<KnowledgeBase[]>([])
const loading = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const formOpen = ref(false)

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

const remove = async (agent: Agent) => {
  try {
    await ElMessageBox.confirm(`删除 Agent「${agent.name}」？`, '删除 Agent', {
      cancelButtonText: '取消',
      confirmButtonText: '删除',
      type: 'warning',
    })
    await deleteAgent(agent.id)
    agents.value = agents.value.filter((item) => item.id !== agent.id)
  } catch (cause) {
    if (isCancelAction(cause)) {
      return
    }

    showErrorMessage(cause, '删除 Agent 失败')
  }
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
  <div class="grid gap-5">
    <header class="flex flex-col items-start justify-between gap-4.5 lg:flex-row lg:items-end">
      <div>
        <h1 class="m-0 text-[34px] font-bold text-foreground">专家 Agent</h1>
      </div>
      <Button @click="openCreate">创建 Agent</Button>
    </header>

    <section
      v-if="chatModels.length === 0 || activeKnowledgeBases.length === 0"
      class="rounded-lg border border-(--zeta-warning-line) bg-(--zeta-warning-soft) px-4 py-3.5 text-(--zeta-warning)"
    >
      创建 Agent 需要至少一个启用的对话模型和一个启用的知识库。
    </section>

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
    <el-dialog v-model="formOpen" :title="title" width="760px">
      <el-form label-position="top" @submit.prevent="save">
        <div class="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <el-form-item label="Agent 名称">
            <el-input v-model="form.name" />
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="form.status">
              <el-option label="草稿" value="DRAFT" />
              <el-option label="已发布" value="PUBLISHED" />
              <el-option label="停用" value="DISABLED" />
            </el-select>
          </el-form-item>
          <el-form-item class="md:col-span-2" label="描述">
            <el-input v-model="form.description" placeholder="例如：IT 服务台、采购制度专家" />
          </el-form-item>
          <el-form-item class="md:col-span-2" label="对话模型">
            <el-select
              v-model="form.modelId"
              :disabled="chatModels.length === 0"
              placeholder="请选择对话模型"
            >
              <el-option
                v-for="model in chatModels"
                :key="model.id"
                :label="`${model.name} - ${model.provider} / ${model.modelName}`"
                :value="model.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item class="md:col-span-2" label="绑定知识库">
            <el-select
              v-model="form.knowledgeBaseIds"
              collapse-tags
              collapse-tags-tooltip
              :disabled="activeKnowledgeBases.length === 0"
              multiple
              placeholder="请选择知识库"
            >
              <el-option
                v-for="knowledgeBase in activeKnowledgeBases"
                :key="knowledgeBase.id"
                :label="knowledgeBase.name"
                :value="knowledgeBase.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="Temperature">
            <el-input-number
              v-model="form.temperature"
              :max="2"
              :min="0"
              :step="0.1"
              controls-position="right"
            />
          </el-form-item>
          <el-form-item label="Top P">
            <el-input-number
              v-model="form.topP"
              :max="1"
              :min="0"
              :step="0.1"
              controls-position="right"
            />
          </el-form-item>
          <el-form-item class="md:col-span-2" label="开场白">
            <el-input v-model="form.openingMessage" :rows="3" type="textarea" />
          </el-form-item>
          <el-form-item class="md:col-span-2" label="Prompt">
            <el-input v-model="form.systemPrompt" :rows="7" type="textarea" />
          </el-form-item>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="formOpen = false">取消</el-button>
        <el-button
          :disabled="chatModels.length === 0 || activeKnowledgeBases.length === 0"
          :loading="saving"
          type="primary"
          @click="save"
        >
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>
