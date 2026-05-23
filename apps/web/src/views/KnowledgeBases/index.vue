<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  listKnowledgeBases,
  updateKnowledgeBase,
  type KnowledgeBase,
  type KnowledgeBasePayload,
  type KnowledgeBaseStatus,
} from '@/apis/knowledge-bases'
import { listModels, type AiModel } from '@/apis/models'

defineOptions({
  name: 'KnowledgeBasesView',
})

const router = useRouter()
const knowledgeBases = ref<KnowledgeBase[]>([])
const models = ref<AiModel[]>([])
const error = ref('')
const loading = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const formOpen = ref(false)

const form = reactive<KnowledgeBasePayload>({
  name: '',
  description: '',
  status: 'ACTIVE',
  embeddingModelId: '',
  chunkSize: 800,
  chunkOverlap: 100,
})

const embeddingModels = computed(() =>
  models.value.filter((model) => model.type === 'EMBEDDING' && model.isEnabled),
)

const title = computed(() => (editingId.value ? '编辑知识库' : '创建知识库'))

const load = async () => {
  loading.value = true
  error.value = ''

  try {
    const [knowledgeBaseList, modelList] = await Promise.all([
      listKnowledgeBases(),
      listModels(),
    ])
    knowledgeBases.value = knowledgeBaseList
    models.value = modelList
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载知识库失败'
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  editingId.value = null
  Object.assign(form, {
    name: '',
    description: '',
    status: 'ACTIVE' as KnowledgeBaseStatus,
    embeddingModelId: embeddingModels.value[0]?.id ?? '',
    chunkSize: 800,
    chunkOverlap: 100,
  })
  formOpen.value = true
}

const openEdit = (knowledgeBase: KnowledgeBase) => {
  editingId.value = knowledgeBase.id
  Object.assign(form, {
    name: knowledgeBase.name,
    description: knowledgeBase.description ?? '',
    status: knowledgeBase.status,
    embeddingModelId: knowledgeBase.embeddingModelId,
    chunkSize: knowledgeBase.chunkSize,
    chunkOverlap: knowledgeBase.chunkOverlap,
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
    }
    const saved = editingId.value
      ? await updateKnowledgeBase(editingId.value, payload)
      : await createKnowledgeBase(payload)
    const index = knowledgeBases.value.findIndex((item) => item.id === saved.id)

    if (index >= 0) {
      knowledgeBases.value[index] = saved
    } else {
      knowledgeBases.value.unshift(saved)
    }

    formOpen.value = false
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存知识库失败'
  } finally {
    saving.value = false
  }
}

const remove = async (knowledgeBase: KnowledgeBase) => {
  error.value = ''

  try {
    await deleteKnowledgeBase(knowledgeBase.id)
    knowledgeBases.value = knowledgeBases.value.filter((item) => item.id !== knowledgeBase.id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '删除知识库失败'
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
  <div class="page-shell">
    <header class="page-head">
      <div>
        <p class="eyebrow">MVP 第二阶段</p>
        <h1>知识库</h1>
        <p>管理知识域、分块配置和后续文档入库入口。</p>
      </div>
      <button class="button" @click="openCreate">创建知识库</button>
    </header>

      <p v-if="error" class="message">{{ error }}</p>

      <section v-if="embeddingModels.length === 0" class="notice">
        还没有可用的 Embedding 模型。请先在模型管理里添加并启用一个 Embedding 模型。
      </section>

      <section class="summary-strip" aria-label="知识库配置说明">
        <article>
          <strong>一级分类</strong>
          <span>知识库就是首版知识分类单位</span>
        </article>
        <article>
          <strong>Embedding 模型</strong>
          <span>决定后续文档和问题的向量空间</span>
        </article>
        <article>
          <strong>分块参数</strong>
          <span>控制文档切分大小与上下文重叠</span>
        </article>
      </section>

      <section class="knowledge-panel">
        <div v-if="loading" class="empty">知识库加载中</div>
        <div v-else-if="knowledgeBases.length === 0" class="empty">还没有知识库</div>

        <table v-else>
          <thead>
            <tr>
              <th>名称</th>
              <th>Embedding 模型</th>
              <th>分块配置</th>
              <th>状态</th>
              <th>更新时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="knowledgeBase in knowledgeBases" :key="knowledgeBase.id">
              <td>
                <strong>{{ knowledgeBase.name }}</strong>
                <small>{{ knowledgeBase.description || '暂无描述' }}</small>
              </td>
              <td>
                <strong>{{ knowledgeBase.embeddingModel.name }}</strong>
                <small>
                  {{ knowledgeBase.embeddingModel.provider }} /
                  {{ knowledgeBase.embeddingModel.modelName }}
                </small>
              </td>
              <td>
                <strong>{{ knowledgeBase.chunkSize }}</strong>
                <small>重叠 {{ knowledgeBase.chunkOverlap }}</small>
              </td>
              <td>
                <span :class="['status', knowledgeBase.status === 'ACTIVE' ? 'enabled' : 'disabled']">
                  {{ knowledgeBase.status === 'ACTIVE' ? '启用' : '停用' }}
                </span>
              </td>
              <td>{{ formatTime(knowledgeBase.updatedAt) }}</td>
              <td class="actions">
                <button
                  class="button secondary"
                  @click="router.push({ name: 'knowledge-base-detail', params: { id: knowledgeBase.id } })"
                >
                  进入
                </button>
                <button class="button secondary" @click="openEdit(knowledgeBase)">编辑</button>
                <button class="button danger" @click="remove(knowledgeBase)">删除</button>
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

        <p v-if="embeddingModels.length === 0" class="message">
          创建知识库前需要先配置一个启用状态的 Embedding 模型。
        </p>

        <div class="form-grid">
          <label class="field">
            知识库名称
            <input v-model="form.name" required />
          </label>
          <label class="field">
            状态
            <select v-model="form.status">
              <option value="ACTIVE">启用</option>
              <option value="DISABLED">停用</option>
            </select>
          </label>
          <label class="field full">
            描述
            <input v-model="form.description" placeholder="例如：人事制度、采购流程、IT 支持" />
          </label>
          <label class="field full">
            Embedding 模型
            <select v-model="form.embeddingModelId" :disabled="embeddingModels.length === 0" required>
              <option value="" disabled>请选择 Embedding 模型</option>
              <option v-for="model in embeddingModels" :key="model.id" :value="model.id">
                {{ model.name }} - {{ model.provider }} / {{ model.modelName }}
              </option>
            </select>
          </label>
          <label class="field">
            分块大小
            <input v-model.number="form.chunkSize" min="1" required type="number" />
          </label>
          <label class="field">
            重叠长度
            <input v-model.number="form.chunkOverlap" min="0" required type="number" />
          </label>
        </div>

        <footer>
          <button class="button secondary" type="button" @click="formOpen = false">取消</button>
          <button class="button" :disabled="saving || embeddingModels.length === 0" type="submit">
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

.knowledge-panel {
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
  min-width: 920px;
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
  width: min(100%, 680px);
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
