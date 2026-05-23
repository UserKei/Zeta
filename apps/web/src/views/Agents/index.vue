<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
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
  if (!window.confirm(`删除 Agent「${agent.name}」？`)) {
    return
  }

  error.value = ''

  try {
    await deleteAgent(agent.id)
    agents.value = agents.value.filter((item) => item.id !== agent.id)
  } catch (cause) {
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

onMounted(load)
</script>

<template>
  <div class="page-shell">
    <header class="page-head">
      <div>
        <p class="eyebrow">MVP 第四阶段</p>
        <h1>专家 Agent</h1>
        <p>绑定对话模型和知识库，形成可问答的知识消费入口。</p>
      </div>
      <button class="button" @click="openCreate">创建 Agent</button>
    </header>

      <p v-if="error" class="message">{{ error }}</p>

      <section v-if="chatModels.length === 0 || activeKnowledgeBases.length === 0" class="notice">
        创建 Agent 需要至少一个启用的对话模型和一个启用的知识库。
      </section>

      <section class="summary-strip" aria-label="Agent 配置说明">
        <article>
          <strong>对话模型</strong>
          <span>负责最终回答生成</span>
        </article>
        <article>
          <strong>绑定知识库</strong>
          <span>限定 Agent 可检索的知识范围</span>
        </article>
        <article>
          <strong>引用来源</strong>
          <span>聊天结果会保存命中的 Chunk 证据</span>
        </article>
      </section>

      <section class="agent-panel">
        <div v-if="loading" class="empty">Agent 加载中</div>
        <div v-else-if="agents.length === 0" class="empty">还没有 Agent</div>

        <table v-else>
          <thead>
            <tr>
              <th>名称</th>
              <th>模型</th>
              <th>绑定知识库</th>
              <th>状态</th>
              <th>更新时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="agent in agents" :key="agent.id">
              <td>
                <strong>{{ agent.name }}</strong>
                <small>{{ agent.description || agent.openingMessage || '暂无描述' }}</small>
              </td>
              <td>
                <strong>{{ agent.model.name }}</strong>
                <small>{{ agent.model.provider }} / {{ agent.model.modelName }}</small>
              </td>
              <td>
                <strong>{{ agent.knowledgeBases.length }} 个知识库</strong>
                <small>{{ agent.knowledgeBases.map((item) => item.name).join('、') }}</small>
              </td>
              <td>
                <span :class="['status', agent.status === 'DISABLED' ? 'disabled' : 'enabled']">
                  {{ statusText(agent.status) }}
                </span>
              </td>
              <td>{{ formatTime(agent.updatedAt) }}</td>
              <td class="actions">
                <button
                  class="button secondary"
                  @click="router.push({ name: 'agent-chat', params: { agentId: agent.id } })"
                >
                  聊天
                </button>
                <button class="button secondary" @click="openEdit(agent)">编辑</button>
                <button class="button danger" @click="remove(agent)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    <div v-if="formOpen" class="dialog-backdrop" @click.self="formOpen = false">
      <form class="dialog" @submit.prevent="save">
        <header>
          <h2>{{ title }}</h2>
          <button class="close" aria-label="关闭" type="button" @click="formOpen = false">x</button>
        </header>

        <div class="form-grid">
          <label class="field">
            Agent 名称
            <input v-model="form.name" required />
          </label>
          <label class="field">
            状态
            <select v-model="form.status">
              <option value="DRAFT">草稿</option>
              <option value="PUBLISHED">已发布</option>
              <option value="DISABLED">停用</option>
            </select>
          </label>
          <label class="field full">
            描述
            <input v-model="form.description" placeholder="例如：IT 服务台、采购制度专家" />
          </label>
          <label class="field full">
            对话模型
            <select v-model="form.modelId" :disabled="chatModels.length === 0" required>
              <option value="" disabled>请选择对话模型</option>
              <option v-for="model in chatModels" :key="model.id" :value="model.id">
                {{ model.name }} - {{ model.provider }} / {{ model.modelName }}
              </option>
            </select>
          </label>
          <label class="field full">
            绑定知识库
            <select
              v-model="form.knowledgeBaseIds"
              :disabled="activeKnowledgeBases.length === 0"
              multiple
              required
            >
              <option v-for="knowledgeBase in activeKnowledgeBases" :key="knowledgeBase.id" :value="knowledgeBase.id">
                {{ knowledgeBase.name }}
              </option>
            </select>
          </label>
          <label class="field">
            Temperature
            <input v-model.number="form.temperature" max="2" min="0" step="0.1" type="number" />
          </label>
          <label class="field">
            Top P
            <input v-model.number="form.topP" max="1" min="0" step="0.1" type="number" />
          </label>
          <label class="field full">
            开场白
            <textarea v-model="form.openingMessage" rows="3" />
          </label>
          <label class="field full">
            Prompt
            <textarea v-model="form.systemPrompt" required rows="7" />
          </label>
        </div>

        <footer>
          <button class="button secondary" type="button" @click="formOpen = false">取消</button>
          <button
            class="button"
            :disabled="saving || chatModels.length === 0 || activeKnowledgeBases.length === 0"
            type="submit"
          >
            {{ saving ? '保存中' : '保存' }}
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

<style scoped>
.page-shell {
  display: grid;
  gap: 20px;
}

.page-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 18px;
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

.page-head p:last-child {
  margin: 10px 0 0;
  color: var(--zeta-muted);
}

.notice {
  border: 1px solid #f4d19b;
  border-radius: 8px;
  padding: 14px 16px;
  background: #fff8eb;
  color: #8a5a10;
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.summary-strip article {
  display: grid;
  gap: 8px;
  border: 1px solid var(--zeta-line);
  border-radius: 8px;
  padding: 18px;
  background: var(--zeta-panel);
}

.summary-strip span,
td small {
  color: var(--zeta-muted);
}

.agent-panel {
  min-width: 0;
  overflow: auto;
  border: 1px solid var(--zeta-line);
  border-radius: 8px;
  background: var(--zeta-panel);
}

.empty {
  min-height: 220px;
  display: grid;
  place-items: center;
  color: var(--zeta-muted);
}

table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
}

th,
td {
  border-bottom: 1px solid var(--zeta-line);
  padding: 16px;
  text-align: left;
}

th {
  color: var(--zeta-muted);
  font-size: 13px;
  font-weight: 700;
}

td:first-child,
td:nth-child(2),
td:nth-child(3) {
  display: grid;
  gap: 4px;
}

tr:last-child td {
  border-bottom: 0;
}

.status {
  display: inline-flex;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 13px;
  font-weight: 700;
}

.status.enabled {
  background: #e3f6ed;
  color: var(--zeta-green);
}

.status.disabled {
  background: #eef1f6;
  color: var(--zeta-muted);
}

.actions {
  display: flex;
  gap: 8px;
  white-space: nowrap;
}

.actions .button {
  min-height: 34px;
  padding: 0 12px;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(14, 24, 45, 0.34);
}

.dialog {
  width: min(100%, 760px);
  max-height: min(92vh, 860px);
  overflow: auto;
  display: grid;
  gap: 20px;
  border: 1px solid var(--zeta-line);
  border-radius: 8px;
  padding: 24px;
  background: #fff;
  box-shadow: var(--zeta-shadow);
}

.dialog header,
.dialog footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dialog footer {
  justify-content: flex-end;
}

.close {
  width: 36px;
  height: 36px;
  border: 1px solid var(--zeta-line);
  border-radius: 8px;
  background: #fff;
  color: var(--zeta-muted);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.field.full {
  grid-column: 1 / -1;
}

.field select[multiple] {
  min-height: 108px;
  padding: 8px;
}

@media (max-width: 820px) {
  .summary-strip,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .page-head {
    align-items: start;
    flex-direction: column;
  }
}
</style>
