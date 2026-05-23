<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
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

defineOptions({
  name: 'AgentsView',
})

const router = useRouter()
const agents = ref<Agent[]>([])
const models = ref<AiModel[]>([])
const knowledgeBases = ref<KnowledgeBase[]>([])
const error = ref('')
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
  knowledgeBases.value.filter((knowledgeBase) => knowledgeBase.status === 'ACTIVE'),
)

const title = computed(() => (editingId.value ? '编辑 Agent' : '创建 Agent'))

const load = async () => {
  loading.value = true
  error.value = ''

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
    error.value = cause instanceof Error ? cause.message : '加载 Agent 失败'
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
    modelId: agent.modelId,
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
  error.value = ''

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
    error.value = cause instanceof Error ? cause.message : '保存 Agent 失败'
  } finally {
    saving.value = false
  }
}

const remove = async (agent: Agent) => {
  error.value = ''

  try {
    await ElMessageBox.confirm(`删除 Agent「${agent.name}」？`, '删除 Agent', {
      cancelButtonText: '取消',
      confirmButtonText: '删除',
      type: 'warning',
    })
    await deleteAgent(agent.id)
    agents.value = agents.value.filter((item) => item.id !== agent.id)
  } catch (cause) {
    if (cause === 'cancel' || cause === 'close') {
      return
    }

    error.value = cause instanceof Error ? cause.message : '删除 Agent 失败'
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

const statusTagType = (status: AgentStatus) => {
  if (status === 'PUBLISHED') {
    return 'success'
  }

  if (status === 'DRAFT') {
    return 'warning'
  }

  return 'info'
}

onMounted(load)
</script>

<template>
  <div class="grid gap-5">
    <header class="flex flex-col items-start justify-between gap-4.5 lg:flex-row lg:items-end">
      <div>
        <p class="mb-2.5 font-bold text-(--zeta-blue)">MVP 第四阶段</p>
        <h1 class="m-0 text-[34px] font-bold">专家 Agent</h1>
        <p class="mt-2.5 text-(--zeta-muted)">绑定对话模型和知识库，形成可问答的知识消费入口。</p>
      </div>
      <el-button type="primary" @click="openCreate">创建 Agent</el-button>
    </header>

    <el-alert v-if="error" :closable="false" :title="error" type="error" />

    <section v-if="chatModels.length === 0 || activeKnowledgeBases.length === 0"
      class="rounded-lg border border-(--zeta-warning-line) bg-(--zeta-warning-soft) px-4 py-3.5 text-(--zeta-warning)">
      创建 Agent 需要至少一个启用的对话模型和一个启用的知识库。
    </section>

    <section class="grid grid-cols-1 gap-3.5 lg:grid-cols-3" aria-label="Agent 配置说明">
      <article class="grid gap-2 rounded-lg border border-(--zeta-line) bg-(--zeta-panel) p-4.5">
        <strong>对话模型</strong>
        <span class="text-(--zeta-muted)">负责最终回答生成</span>
      </article>
      <article class="grid gap-2 rounded-lg border border-(--zeta-line) bg-(--zeta-panel) p-4.5">
        <strong>绑定知识库</strong>
        <span class="text-(--zeta-muted)">限定 Agent 可检索的知识范围</span>
      </article>
      <article class="grid gap-2 rounded-lg border border-(--zeta-line) bg-(--zeta-panel) p-4.5">
        <strong>引用来源</strong>
        <span class="text-(--zeta-muted)">聊天结果会保存命中的 Chunk 证据</span>
      </article>
    </section>

    <section class="min-w-0 rounded-lg border border-(--zeta-line) bg-(--zeta-panel)">
      <el-table v-loading="loading" :data="agents" empty-text="还没有 Agent">
        <el-table-column label="名称" min-width="240">
          <template #default="{ row }: { row: Agent }">
            <div class="grid gap-1">
              <strong>{{ row.name }}</strong>
              <small class="text-(--zeta-muted)">
                {{ row.description || row.openingMessage || '暂无描述' }}
              </small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="模型" min-width="220">
          <template #default="{ row }: { row: Agent }">
            <div class="grid gap-1">
              <strong>{{ row.model.name }}</strong>
              <small class="text-(--zeta-muted)">
                {{ row.model.provider }} / {{ row.model.modelName }}
              </small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="绑定知识库" min-width="240">
          <template #default="{ row }: { row: Agent }">
            <div class="grid gap-1">
              <strong>{{ row.knowledgeBases.length }} 个知识库</strong>
              <small class="text-(--zeta-muted)">
                {{row.knowledgeBases.map((item) => item.name).join('、')}}
              </small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="100">
          <template #default="{ row }: { row: Agent }">
            <el-tag :type="statusTagType(row.status)" effect="light">
              {{ statusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="150">
          <template #default="{ row }: { row: Agent }">
            {{ formatTime(row.updatedAt) }}
          </template>
        </el-table-column>
        <el-table-column align="right" fixed="right" label="操作" min-width="210">
          <template #default="{ row }: { row: Agent }">
            <el-button size="small" @click="router.push({ name: 'agent-chat', params: { agentId: row.id } })">
              聊天
            </el-button>
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>
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
            <el-select v-model="form.modelId" :disabled="chatModels.length === 0" placeholder="请选择对话模型">
              <el-option v-for="model in chatModels" :key="model.id"
                :label="`${model.name} - ${model.provider} / ${model.modelName}`" :value="model.id" />
            </el-select>
          </el-form-item>
          <el-form-item class="md:col-span-2" label="绑定知识库">
            <el-select v-model="form.knowledgeBaseIds" collapse-tags collapse-tags-tooltip
              :disabled="activeKnowledgeBases.length === 0" multiple placeholder="请选择知识库">
              <el-option v-for="knowledgeBase in activeKnowledgeBases" :key="knowledgeBase.id"
                :label="knowledgeBase.name" :value="knowledgeBase.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="Temperature">
            <el-input-number v-model="form.temperature" :max="2" :min="0" :step="0.1" controls-position="right" />
          </el-form-item>
          <el-form-item label="Top P">
            <el-input-number v-model="form.topP" :max="1" :min="0" :step="0.1" controls-position="right" />
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
        <el-button :disabled="chatModels.length === 0 || activeKnowledgeBases.length === 0" :loading="saving"
          type="primary" @click="save">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>
