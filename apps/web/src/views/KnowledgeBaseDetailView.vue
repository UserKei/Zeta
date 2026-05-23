<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  createManualDocument,
  deleteDocument,
  getCurrentUser,
  getKnowledgeBase,
  listDocumentChunks,
  listDocuments,
  testKnowledgeBaseRetrieval,
  type DocumentStatus,
  type KnowledgeBase,
  type KnowledgeChunk,
  type KnowledgeDocument,
  type ManualDocumentPayload,
  type RetrievalResult,
} from '@/api'
import { clearAuth, getStoredUser, type AuthUser } from '@/auth'

const route = useRoute()
const router = useRouter()
const knowledgeBaseId = computed(() => String(route.params.id ?? ''))

const user = ref<AuthUser | null>(getStoredUser())
const knowledgeBase = ref<KnowledgeBase | null>(null)
const documents = ref<KnowledgeDocument[]>([])
const chunks = ref<KnowledgeChunk[]>([])
const selectedDocument = ref<KnowledgeDocument | null>(null)
const retrievalResult = ref<RetrievalResult | null>(null)
const error = ref('')
const loading = ref(false)
const saving = ref(false)
const chunksLoading = ref(false)
const retrieving = ref(false)
const formOpen = ref(false)

const form = reactive<ManualDocumentPayload>({
  name: '',
  description: '',
  content: '',
})

const retrievalForm = reactive({
  question: '',
  topK: 5,
})

const indexedCount = computed(
  () => documents.value.filter((document) => document.status === 'INDEXED').length,
)

const totalChunks = computed(() =>
  documents.value.reduce((total, document) => total + document.chunkCount, 0),
)

const load = async () => {
  loading.value = true
  error.value = ''

  try {
    const [currentUser, knowledgeBaseDetail, documentList] = await Promise.all([
      getCurrentUser(),
      getKnowledgeBase(knowledgeBaseId.value),
      listDocuments(knowledgeBaseId.value),
    ])
    user.value = currentUser
    knowledgeBase.value = knowledgeBaseDetail
    documents.value = documentList
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载知识库详情失败'
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  Object.assign(form, {
    name: '',
    description: '',
    content: '',
  })
  formOpen.value = true
}

const saveDocument = async () => {
  saving.value = true
  error.value = ''

  try {
    const saved = await createManualDocument(knowledgeBaseId.value, {
      ...form,
      description: form.description || undefined,
    })
    documents.value.unshift(saved)
    formOpen.value = false
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存文档失败'
  } finally {
    saving.value = false
  }
}

const showChunks = async (document: KnowledgeDocument) => {
  selectedDocument.value = document
  chunksLoading.value = true
  error.value = ''

  try {
    chunks.value = await listDocumentChunks(document.id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载分块失败'
  } finally {
    chunksLoading.value = false
  }
}

const removeDocument = async (document: KnowledgeDocument) => {
  if (!window.confirm(`删除文档「${document.name}」？`)) {
    return
  }

  error.value = ''

  try {
    await deleteDocument(document.id)
    documents.value = documents.value.filter((item) => item.id !== document.id)

    if (selectedDocument.value?.id === document.id) {
      selectedDocument.value = null
      chunks.value = []
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '删除文档失败'
  }
}

const runRetrieval = async () => {
  retrieving.value = true
  error.value = ''

  try {
    retrievalResult.value = await testKnowledgeBaseRetrieval(knowledgeBaseId.value, {
      question: retrievalForm.question,
      topK: retrievalForm.topK,
    })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '检索测试失败'
  } finally {
    retrieving.value = false
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

const formatScore = (value: number) => `${(value * 100).toFixed(1)}%`

const statusText = (status: DocumentStatus) =>
  ({
    UPLOADED: '已上传',
    PARSING: '解析中',
    CHUNKING: '分块中',
    EMBEDDING: '向量化',
    INDEXED: '已索引',
    FAILED: '失败',
    DISABLED: '停用',
  })[status]

const statusClass = (status: DocumentStatus) => {
  if (status === 'INDEXED') {
    return 'enabled'
  }

  if (status === 'FAILED' || status === 'DISABLED') {
    return 'danger'
  }

  return 'pending'
}

onMounted(load)
</script>

<template>
  <main class="workspace">
    <aside class="sidebar">
      <div>
        <p class="brand">Zeta</p>
        <nav>
          <button class="nav-item" @click="router.push({ name: 'models' })">模型管理</button>
          <button class="nav-item active" @click="router.push({ name: 'knowledge-bases' })">
            知识库
          </button>
          <button class="nav-item" disabled>专家 Agent</button>
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
          <p class="eyebrow">MVP 第三阶段</p>
          <h1>{{ knowledgeBase?.name || '知识库详情' }}</h1>
          <p>{{ knowledgeBase?.description || '维护文档、分块和检索测试。' }}</p>
        </div>
        <div class="head-actions">
          <button class="button secondary" @click="router.push({ name: 'knowledge-bases' })">
            返回
          </button>
          <button class="button" :disabled="loading" @click="openCreate">新增文本知识</button>
        </div>
      </header>

      <p v-if="error" class="message">{{ error }}</p>

      <section class="summary-strip" aria-label="知识库索引状态">
        <article>
          <strong>{{ knowledgeBase?.embeddingModel.name || '-' }}</strong>
          <span>{{ knowledgeBase?.embeddingModel.modelName || 'Embedding 模型' }}</span>
        </article>
        <article>
          <strong>{{ knowledgeBase?.chunkSize || 0 }} / {{ knowledgeBase?.chunkOverlap || 0 }}</strong>
          <span>分块大小 / 重叠长度</span>
        </article>
        <article>
          <strong>{{ indexedCount }} / {{ documents.length }}</strong>
          <span>已索引文档 / 全部文档，分块 {{ totalChunks }}</span>
        </article>
      </section>

      <section class="detail-grid">
        <article class="panel documents-panel">
          <header class="panel-head">
            <div>
              <h2>文档</h2>
              <p>手动文本会立即分块并写入向量索引。</p>
            </div>
          </header>

          <div v-if="loading" class="empty">文档加载中</div>
          <div v-else-if="documents.length === 0" class="empty">还没有文档</div>

          <table v-else>
            <thead>
              <tr>
                <th>名称</th>
                <th>状态</th>
                <th>字符 / 分块</th>
                <th>更新时间</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="document in documents" :key="document.id">
                <td>
                  <strong>{{ document.name }}</strong>
                  <small>{{ document.sourceType === 'MANUAL' ? '手动录入' : document.sourceType }}</small>
                </td>
                <td>
                  <span :class="['status', statusClass(document.status)]">
                    {{ statusText(document.status) }}
                  </span>
                  <small v-if="document.errorMessage">{{ document.errorMessage }}</small>
                </td>
                <td>
                  <strong>{{ document.charCount }}</strong>
                  <small>分块 {{ document.chunkCount }}</small>
                </td>
                <td>{{ formatTime(document.updatedAt) }}</td>
                <td class="actions">
                  <button class="button secondary" @click="showChunks(document)">分块</button>
                  <button class="button danger" @click="removeDocument(document)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </article>

        <article class="panel retrieval-panel">
          <header class="panel-head">
            <div>
              <h2>检索测试</h2>
              <p>在当前知识库的已索引分块里召回内容。</p>
            </div>
          </header>

          <form class="retrieval-form" @submit.prevent="runRetrieval">
            <label class="field">
              问题
              <textarea v-model="retrievalForm.question" required rows="4" />
            </label>
            <label class="field">
              Top K
              <input v-model.number="retrievalForm.topK" max="20" min="1" required type="number" />
            </label>
            <button class="button" :disabled="retrieving" type="submit">
              {{ retrieving ? '检索中' : '测试检索' }}
            </button>
          </form>

          <div v-if="retrievalResult" class="hit-list">
            <article v-if="retrievalResult.hits.length === 0" class="empty compact">暂无命中</article>
            <template v-else>
              <article v-for="hit in retrievalResult.hits" :key="hit.chunkId" class="hit">
                <header>
                  <strong>{{ hit.documentName }}</strong>
                  <span>{{ formatScore(hit.score) }}</span>
                </header>
                <p>{{ hit.content }}</p>
                <small>分块 #{{ hit.position + 1 }}，{{ hit.charCount }} 字符</small>
              </article>
            </template>
          </div>
        </article>
      </section>

      <section v-if="selectedDocument" class="panel chunks-panel">
        <header class="panel-head">
          <div>
            <h2>{{ selectedDocument.name }} 的分块</h2>
            <p>{{ selectedDocument.chunkCount }} 个分块</p>
          </div>
          <button class="button secondary" @click="selectedDocument = null">收起</button>
        </header>

        <div v-if="chunksLoading" class="empty compact">分块加载中</div>
        <div v-else class="chunk-list">
          <article v-for="chunk in chunks" :key="chunk.id" class="chunk">
            <header>
              <strong>#{{ chunk.position + 1 }}</strong>
              <span>{{ chunk.charCount }} 字符</span>
            </header>
            <p>{{ chunk.content }}</p>
          </article>
        </div>
      </section>
    </section>

    <div v-if="formOpen" class="dialog-backdrop" @click.self="formOpen = false">
      <form class="dialog" @submit.prevent="saveDocument">
        <header>
          <h2>新增文本知识</h2>
          <button class="close" aria-label="关闭" type="button" @click="formOpen = false">x</button>
        </header>

        <div class="form-grid">
          <label class="field">
            文档名称
            <input v-model="form.name" required />
          </label>
          <label class="field">
            描述
            <input v-model="form.description" />
          </label>
          <label class="field full">
            正文
            <textarea v-model="form.content" required rows="12" />
          </label>
        </div>

        <footer>
          <button class="button secondary" type="button" @click="formOpen = false">取消</button>
          <button class="button" :disabled="saving" type="submit">
            {{ saving ? '索引中' : '保存并索引' }}
          </button>
        </footer>
      </form>
    </div>
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
.head-actions,
.panel-head {
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

.page-head p:last-child,
.panel-head p {
  margin: 10px 0 0;
  color: var(--zeta-muted);
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.summary-strip article,
.panel {
  border: 1px solid var(--zeta-line);
  border-radius: 8px;
  background: var(--zeta-panel);
}

.summary-strip article {
  display: grid;
  gap: 8px;
  padding: 18px;
}

.summary-strip span,
td small,
.hit small,
.chunk span {
  color: var(--zeta-muted);
}

.detail-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(360px, 0.65fr);
  gap: 18px;
}

.panel {
  min-width: 0;
  overflow: hidden;
}

.panel-head {
  border-bottom: 1px solid var(--zeta-line);
  padding: 18px;
}

.documents-panel {
  overflow-x: auto;
}

.empty {
  min-height: 220px;
  display: grid;
  place-items: center;
  color: var(--zeta-muted);
}

.empty.compact {
  min-height: 96px;
}

table {
  width: 100%;
  min-width: 780px;
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
  width: fit-content;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 13px;
  font-weight: 700;
}

.status.enabled {
  background: #e3f6ed;
  color: var(--zeta-green);
}

.status.pending {
  background: #fff4df;
  color: #9a6400;
}

.status.danger {
  background: #fff4f5;
  color: var(--zeta-danger);
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

.retrieval-panel {
  display: grid;
  align-content: start;
}

.retrieval-form,
.hit-list,
.chunk-list {
  display: grid;
  gap: 14px;
  padding: 18px;
}

.hit,
.chunk {
  display: grid;
  gap: 10px;
  border: 1px solid var(--zeta-line);
  border-radius: 8px;
  padding: 14px;
  background: #fff;
}

.hit header,
.chunk header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.hit p,
.chunk p {
  margin: 0;
  color: #25324a;
  line-height: 1.7;
  white-space: pre-wrap;
}

.chunks-panel {
  overflow: visible;
}

.chunk-list {
  max-height: 520px;
  overflow: auto;
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

@media (max-width: 1020px) {
  .detail-grid {
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
  .summary-strip,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .page-head,
  .head-actions,
  .panel-head {
    align-items: start;
    flex-direction: column;
  }
}
</style>
