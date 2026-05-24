<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import {
  createDocumentChunk,
  createManualDocument,
  deleteDocument,
  deleteDocumentChunk,
  listDocumentChunks,
  listDocuments,
  parseMarkdownDocument,
  testKnowledgeBaseRetrieval,
  updateDocumentChunk,
  type ChunkDraftPayload,
  type ChunkStatus,
  type DocumentStatus,
  type KnowledgeChunk,
  type KnowledgeDocument,
  type ManualDocumentPayload,
  type RetrievalResult,
} from '@/apis/knowledge-docs'
import { getKnowledgeBase, type KnowledgeBase } from '@/apis/knowledge-bases'

defineOptions({
  name: 'KnowledgeBaseDetail',
})

type ChunkForm = {
  title: string
  content: string
  status: ChunkStatus
}

type DocumentForm = {
  name: string
  description: string
  chunks: ChunkForm[]
}

const route = useRoute()
const router = useRouter()
const knowledgeBaseId = computed(() => String(route.params.id ?? ''))

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
const markdownContent = ref('')
const parsingMarkdown = ref(false)
const chunkDialogOpen = ref(false)
const chunkEditingId = ref<string | null>(null)
const chunkSaving = ref(false)

const createEmptyChunk = (content = ''): ChunkForm => ({
  title: '',
  content,
  status: 'ACTIVE',
})

const form = reactive<DocumentForm>({
  name: '',
  description: '',
  chunks: [createEmptyChunk()],
})

const chunkForm = reactive<ChunkForm>(createEmptyChunk())

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
    const [knowledgeBaseDetail, documentList] = await Promise.all([
      getKnowledgeBase(knowledgeBaseId.value),
      listDocuments(knowledgeBaseId.value),
    ])
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
    chunks: [createEmptyChunk()],
  })
  markdownContent.value = ''
  formOpen.value = true
}

const addFormChunk = () => {
  form.chunks.push(createEmptyChunk())
}

const removeFormChunk = (index: number) => {
  if (form.chunks.length === 1) {
    form.chunks[0] = createEmptyChunk()
    return
  }

  form.chunks.splice(index, 1)
}

const applyMarkdown = async () => {
  parsingMarkdown.value = true
  error.value = ''

  try {
    const result = await parseMarkdownDocument(knowledgeBaseId.value, {
      content: markdownContent.value,
    })
    form.chunks = result.chunks.map(toChunkForm)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Markdown 解析失败'
  } finally {
    parsingMarkdown.value = false
  }
}

const saveDocument = async () => {
  saving.value = true
  error.value = ''

  try {
    const payload: ManualDocumentPayload = {
      name: form.name,
      description: form.description || undefined,
      chunks: form.chunks.map(toChunkPayload),
    }
    const saved = await createManualDocument(knowledgeBaseId.value, payload)
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
    error.value = cause instanceof Error ? cause.message : '加载分段失败'
  } finally {
    chunksLoading.value = false
  }
}

const syncSelectedDocument = async (documentId: string) => {
  const [documentList, chunkList] = await Promise.all([
    listDocuments(knowledgeBaseId.value),
    listDocumentChunks(documentId),
  ])
  documents.value = documentList
  selectedDocument.value = documentList.find((document) => document.id === documentId) ?? null
  chunks.value = selectedDocument.value ? chunkList : []
}

const openCreateChunk = () => {
  if (!selectedDocument.value) {
    return
  }

  Object.assign(chunkForm, createEmptyChunk())
  chunkEditingId.value = null
  chunkDialogOpen.value = true
}

const openEditChunk = (chunk: KnowledgeChunk) => {
  Object.assign(chunkForm, {
    title: chunk.title ?? '',
    content: chunk.content,
    status: chunk.status,
  })
  chunkEditingId.value = chunk.id
  chunkDialogOpen.value = true
}

const saveChunk = async () => {
  if (!selectedDocument.value) {
    return
  }

  chunkSaving.value = true
  error.value = ''

  try {
    if (chunkEditingId.value) {
      await updateDocumentChunk(chunkEditingId.value, toChunkPayload(chunkForm))
    } else {
      await createDocumentChunk(selectedDocument.value.id, toChunkPayload(chunkForm))
    }

    await syncSelectedDocument(selectedDocument.value.id)
    chunkDialogOpen.value = false
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存分段失败'
  } finally {
    chunkSaving.value = false
  }
}

const toggleChunk = async (chunk: KnowledgeChunk) => {
  error.value = ''

  try {
    await updateDocumentChunk(chunk.id, {
      status: chunk.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
    })
    await syncSelectedDocument(chunk.documentId)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '更新分段状态失败'
  }
}

const removeChunk = async (chunk: KnowledgeChunk) => {
  error.value = ''

  try {
    await ElMessageBox.confirm(`删除分段 #${chunk.position + 1}？`, '删除分段', {
      cancelButtonText: '取消',
      confirmButtonText: '删除',
      type: 'warning',
    })
    await deleteDocumentChunk(chunk.id)
    await syncSelectedDocument(chunk.documentId)
  } catch (cause) {
    if (cause === 'cancel' || cause === 'close') {
      return
    }

    error.value = cause instanceof Error ? cause.message : '删除分段失败'
  }
}

const removeDocument = async (document: KnowledgeDocument) => {
  error.value = ''

  try {
    await ElMessageBox.confirm(`删除文档「${document.name}」？`, '删除文档', {
      cancelButtonText: '取消',
      confirmButtonText: '删除',
      type: 'warning',
    })
    await deleteDocument(document.id)
    documents.value = documents.value.filter((item) => item.id !== document.id)

    if (selectedDocument.value?.id === document.id) {
      selectedDocument.value = null
      chunks.value = []
    }
  } catch (cause) {
    if (cause === 'cancel' || cause === 'close') {
      return
    }

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

const toChunkPayload = (chunk: ChunkForm): ChunkDraftPayload => ({
  title: chunk.title || undefined,
  content: chunk.content,
  status: chunk.status,
})

const toChunkForm = (chunk: ChunkDraftPayload): ChunkForm => ({
  title: chunk.title ?? '',
  content: chunk.content,
  status: chunk.status ?? 'ACTIVE',
})

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
    CHUNKING: '分段中',
    EMBEDDING: '向量化',
    INDEXED: '已索引',
    FAILED: '失败',
    DISABLED: '停用',
  })[status]

const statusClass = (status: DocumentStatus) => {
  if (status === 'INDEXED') {
    return 'success'
  }

  if (status === 'FAILED' || status === 'DISABLED') {
    return 'danger'
  }

  return 'warning'
}

const chunkStatusText = (status: ChunkStatus) =>
  ({
    ACTIVE: '启用',
    DISABLED: '停用',
  })[status]

const chunkStatusClass = (status: ChunkStatus) => (status === 'ACTIVE' ? 'success' : 'info')

const sourceText = (document: KnowledgeDocument) =>
  ({
    MANUAL: '手动分段',
    FILE_UPLOAD: '文件上传',
    AI_EXTRACTED: 'AI 提炼',
    WEB_IMPORT: '网页导入',
  })[document.sourceType]

onMounted(load)
</script>

<template>
  <div class="grid gap-5">
    <header class="flex flex-col items-start justify-between gap-4.5 lg:flex-row lg:items-end">
      <div>
        <p class="mb-2.5 font-bold text-(--zeta-blue)">MVP 第三阶段</p>
        <h1 class="m-0 text-[34px] font-bold">{{ knowledgeBase?.name || '知识库详情' }}</h1>
        <p class="mt-2.5 text-(--zeta-muted)">
          {{ knowledgeBase?.description || '维护文档、分段和检索测试。' }}
        </p>
      </div>
      <div class="flex flex-col items-start gap-4.5 sm:flex-row sm:items-center">
        <el-button @click="router.push({ name: 'knowledge-bases' })">返回</el-button>
        <el-button :disabled="loading" type="primary" @click="openCreate">
          新增文本知识
        </el-button>
      </div>
    </header>

    <el-alert v-if="error" :closable="false" :title="error" type="error" />

    <section class="grid grid-cols-1 gap-3.5 lg:grid-cols-3" aria-label="知识库索引状态">
      <article class="grid gap-2 rounded-lg border border-(--zeta-line) bg-(--zeta-panel) p-4.5">
        <strong>{{ knowledgeBase?.embeddingModel.name || '-' }}</strong>
        <span class="text-(--zeta-muted)">
          {{ knowledgeBase?.embeddingModel.modelName || 'Embedding 模型' }}
        </span>
      </article>
      <article class="grid gap-2 rounded-lg border border-(--zeta-line) bg-(--zeta-panel) p-4.5">
        <strong>{{ knowledgeBase?.chunkSize || 0 }} / {{ knowledgeBase?.chunkOverlap || 0 }}</strong>
        <span class="text-(--zeta-muted)">文件解析默认分块大小 / 重叠长度</span>
      </article>
      <article class="grid gap-2 rounded-lg border border-(--zeta-line) bg-(--zeta-panel) p-4.5">
        <strong>{{ indexedCount }} / {{ documents.length }}</strong>
        <span class="text-(--zeta-muted)">已索引文档 / 全部文档，分段 {{ totalChunks }}</span>
      </article>
    </section>

    <section class="grid min-w-0 grid-cols-1 gap-4.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
      <article class="min-w-0 overflow-hidden rounded-lg border border-(--zeta-line) bg-(--zeta-panel)">
        <header
          class="flex flex-col items-start justify-between gap-4.5 border-b border-(--zeta-line) p-4.5 lg:flex-row lg:items-end">
          <div>
            <h2 class="m-0 text-xl font-bold">文档</h2>
            <p class="mt-2.5 text-(--zeta-muted)">手动知识由用户维护分段，Markdown 可先解析为分段草稿。</p>
          </div>
        </header>

        <el-table v-loading="loading" :data="documents" empty-text="还没有文档">
          <el-table-column label="名称" min-width="220">
            <template #default="{ row }: { row: KnowledgeDocument }">
              <div class="grid gap-1">
                <strong>{{ row.name }}</strong>
                <small class="text-(--zeta-muted)">{{ sourceText(row) }}</small>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="状态" min-width="150">
            <template #default="{ row }: { row: KnowledgeDocument }">
              <div class="grid gap-1">
                <el-tag :type="statusClass(row.status)" effect="light">
                  {{ statusText(row.status) }}
                </el-tag>
                <small v-if="row.errorMessage" class="text-(--zeta-muted)">
                  {{ row.errorMessage }}
                </small>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="字符 / 分段" min-width="130">
            <template #default="{ row }: { row: KnowledgeDocument }">
              <div class="grid gap-1">
                <strong>{{ row.charCount }}</strong>
                <small class="text-(--zeta-muted)">分段 {{ row.chunkCount }}</small>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="更新时间" min-width="150">
            <template #default="{ row }: { row: KnowledgeDocument }">
              {{ formatTime(row.updatedAt) }}
            </template>
          </el-table-column>
          <el-table-column align="right" fixed="right" label="操作" min-width="140">
            <template #default="{ row }: { row: KnowledgeDocument }">
              <el-button size="small" @click="showChunks(row)">分段</el-button>
              <el-button size="small" type="danger" @click="removeDocument(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </article>

      <article
        class="grid min-w-0 content-start overflow-hidden rounded-lg border border-(--zeta-line) bg-(--zeta-panel)">
        <header
          class="flex flex-col items-start justify-between gap-4.5 border-b border-(--zeta-line) p-4.5 lg:flex-row lg:items-end">
          <div>
            <h2 class="m-0 text-xl font-bold">检索测试</h2>
            <p class="mt-2.5 text-(--zeta-muted)">在当前知识库的已索引分段里召回内容。</p>
          </div>
        </header>

        <el-form class="grid gap-3.5 p-4.5" label-position="top" @submit.prevent="runRetrieval">
          <el-form-item label="问题">
            <el-input v-model="retrievalForm.question" :rows="4" type="textarea" />
          </el-form-item>
          <el-form-item label="Top K">
            <el-input-number v-model="retrievalForm.topK" :max="20" :min="1" controls-position="right" />
          </el-form-item>
          <el-button :loading="retrieving" native-type="submit" type="primary">
            测试检索
          </el-button>
        </el-form>

        <div v-if="retrievalResult" class="grid gap-3.5 p-4.5">
          <article v-if="retrievalResult.hits.length === 0"
            class="grid min-h-24 place-items-center text-(--zeta-muted)">
            暂无命中
          </article>
          <template v-else>
            <article v-for="hit in retrievalResult.hits" :key="hit.chunkId"
              class="grid gap-2.5 rounded-lg border border-(--zeta-line) bg-(--zeta-panel) p-3.5">
              <header class="flex justify-between gap-3">
                <strong>{{ hit.documentName }}</strong>
                <el-tag effect="light" type="success">{{ formatScore(hit.score) }}</el-tag>
              </header>
              <p class="m-0 whitespace-pre-wrap text-(--zeta-content) leading-7">{{ hit.content }}</p>
              <small class="text-(--zeta-muted)">
                分段 #{{ hit.position + 1 }}，{{ hit.charCount }} 字符
              </small>
            </article>
          </template>
        </div>
      </article>
    </section>

    <section v-if="selectedDocument"
      class="min-w-0 overflow-visible rounded-lg border border-(--zeta-line) bg-(--zeta-panel)">
      <header
        class="flex flex-col items-start justify-between gap-4.5 border-b border-(--zeta-line) p-4.5 lg:flex-row lg:items-end">
        <div>
          <h2 class="m-0 text-xl font-bold">{{ selectedDocument.name }} 的分段</h2>
          <p class="mt-2.5 text-(--zeta-muted)">{{ selectedDocument.chunkCount }} 个分段</p>
        </div>
        <div class="flex gap-3">
          <el-button type="primary" @click="openCreateChunk">新增分段</el-button>
          <el-button @click="selectedDocument = null">收起</el-button>
        </div>
      </header>

      <div v-if="chunksLoading" class="grid min-h-24 place-items-center text-(--zeta-muted)">分段加载中</div>
      <div v-else class="grid max-h-130 gap-3.5 overflow-auto p-4.5">
        <article v-for="chunk in chunks" :key="chunk.id"
          class="grid gap-3 rounded-lg border border-(--zeta-line) bg-(--zeta-panel) p-3.5">
          <header class="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
            <div class="grid gap-1">
              <strong>{{ chunk.title || `分段 #${chunk.position + 1}` }}</strong>
              <span class="text-(--zeta-muted)">{{ chunk.charCount }} 字符</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <el-tag :type="chunkStatusClass(chunk.status)" effect="light">
                {{ chunkStatusText(chunk.status) }}
              </el-tag>
              <el-button size="small" @click="openEditChunk(chunk)">编辑</el-button>
              <el-button size="small" @click="toggleChunk(chunk)">
                {{ chunk.status === 'ACTIVE' ? '停用' : '启用' }}
              </el-button>
              <el-button size="small" type="danger" @click="removeChunk(chunk)">删除</el-button>
            </div>
          </header>
          <p class="m-0 whitespace-pre-wrap text-(--zeta-content) leading-7">{{ chunk.content }}</p>
        </article>
      </div>
    </section>

    <el-dialog v-model="formOpen" title="新增文本知识" width="920px">
      <el-form label-position="top" @submit.prevent="saveDocument">
        <div class="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <el-form-item label="文档名称">
            <el-input v-model="form.name" />
          </el-form-item>
          <el-form-item label="描述">
            <el-input v-model="form.description" />
          </el-form-item>
        </div>

        <section class="mb-4 grid gap-3 rounded-lg border border-(--zeta-line) bg-(--zeta-surface-soft) p-3.5">
          <div class="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
            <div>
              <strong>Markdown 解析</strong>
              <p class="mt-2 text-(--zeta-muted)">粘贴 Markdown 后按标题生成分段草稿，可再手动调整。</p>
            </div>
            <el-button :loading="parsingMarkdown" @click="applyMarkdown">解析为分段</el-button>
          </div>
          <el-input v-model="markdownContent" :rows="5" placeholder="# 标题&#10;正文内容" type="textarea" />
        </section>

        <section class="grid gap-3.5">
          <header class="flex items-center justify-between gap-3">
            <strong>分段列表</strong>
            <el-button @click="addFormChunk">添加分段</el-button>
          </header>

          <article v-for="(chunk, index) in form.chunks" :key="index"
            class="grid gap-3 rounded-lg border border-(--zeta-line) p-3.5">
            <header class="flex items-center justify-between gap-3">
              <strong>分段 #{{ index + 1 }}</strong>
              <el-button size="small" type="danger" @click="removeFormChunk(index)">删除</el-button>
            </header>
            <div class="grid grid-cols-1 gap-3.5 md:grid-cols-[minmax(0,1fr)_140px]">
              <el-form-item label="标题">
                <el-input v-model="chunk.title" />
              </el-form-item>
              <el-form-item label="状态">
                <el-select v-model="chunk.status">
                  <el-option label="启用" value="ACTIVE" />
                  <el-option label="停用" value="DISABLED" />
                </el-select>
              </el-form-item>
              <el-form-item class="md:col-span-2" label="内容">
                <el-input v-model="chunk.content" :rows="6" type="textarea" />
              </el-form-item>
            </div>
          </article>
        </section>
      </el-form>

      <template #footer>
        <el-button @click="formOpen = false">取消</el-button>
        <el-button :loading="saving" type="primary" @click="saveDocument">保存并索引</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="chunkDialogOpen" :title="chunkEditingId ? '编辑分段' : '新增分段'" width="760px">
      <el-form label-position="top" @submit.prevent="saveChunk">
        <div class="grid grid-cols-1 gap-3.5 md:grid-cols-[minmax(0,1fr)_140px]">
          <el-form-item label="标题">
            <el-input v-model="chunkForm.title" />
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="chunkForm.status">
              <el-option label="启用" value="ACTIVE" />
              <el-option label="停用" value="DISABLED" />
            </el-select>
          </el-form-item>
          <el-form-item class="md:col-span-2" label="内容">
            <el-input v-model="chunkForm.content" :rows="10" type="textarea" />
          </el-form-item>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="chunkDialogOpen = false">取消</el-button>
        <el-button :loading="chunkSaving" type="primary" @click="saveChunk">保存并重建索引</el-button>
      </template>
    </el-dialog>
  </div>
</template>
