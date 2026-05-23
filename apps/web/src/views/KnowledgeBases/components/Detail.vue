<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import {
  createManualDocument,
  deleteDocument,
  listDocumentChunks,
  listDocuments,
  testKnowledgeBaseRetrieval,
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
    return 'success'
  }

  if (status === 'FAILED' || status === 'DISABLED') {
    return 'danger'
  }

  return 'warning'
}

onMounted(load)
</script>

<template>
  <div class="grid gap-5">
    <header class="flex flex-col items-start justify-between gap-4.5 lg:flex-row lg:items-end">
      <div>
        <p class="mb-2.5 font-bold text-(--zeta-blue)">MVP 第三阶段</p>
        <h1 class="m-0 text-[34px] font-bold">{{ knowledgeBase?.name || '知识库详情' }}</h1>
        <p class="mt-2.5 text-(--zeta-muted)">
          {{ knowledgeBase?.description || '维护文档、分块和检索测试。' }}
        </p>
      </div>
      <div class="flex flex-col items-start gap-4.5 sm:flex-row sm:items-center">
        <el-button @click="router.push({ name: 'knowledge-bases' })">
          返回
        </el-button>
        <el-button :disabled="loading" type="primary" @click="openCreate">新增文本知识</el-button>
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
        <span class="text-(--zeta-muted)">分块大小 / 重叠长度</span>
      </article>
      <article class="grid gap-2 rounded-lg border border-(--zeta-line) bg-(--zeta-panel) p-4.5">
        <strong>{{ indexedCount }} / {{ documents.length }}</strong>
        <span class="text-(--zeta-muted)">已索引文档 / 全部文档，分块 {{ totalChunks }}</span>
      </article>
    </section>

    <section class="grid min-w-0 grid-cols-1 gap-4.5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
      <article class="min-w-0 overflow-hidden rounded-lg border border-(--zeta-line) bg-(--zeta-panel)">
        <header
          class="flex flex-col items-start justify-between gap-4.5 border-b border-(--zeta-line) p-4.5 lg:flex-row lg:items-end">
          <div>
            <h2 class="m-0 text-xl font-bold">文档</h2>
            <p class="mt-2.5 text-(--zeta-muted)">手动文本会立即分块并写入向量索引。</p>
          </div>
        </header>

        <el-table v-loading="loading" :data="documents" empty-text="还没有文档">
          <el-table-column label="名称" min-width="220">
            <template #default="{ row }: { row: KnowledgeDocument }">
              <div class="grid gap-1">
                <strong>{{ row.name }}</strong>
                <small class="text-(--zeta-muted)">
                  {{ row.sourceType === 'MANUAL' ? '手动录入' : row.sourceType }}
                </small>
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
          <el-table-column label="字符 / 分块" min-width="130">
            <template #default="{ row }: { row: KnowledgeDocument }">
              <div class="grid gap-1">
                <strong>{{ row.charCount }}</strong>
                <small class="text-(--zeta-muted)">分块 {{ row.chunkCount }}</small>
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
              <el-button size="small" @click="showChunks(row)">分块</el-button>
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
            <p class="mt-2.5 text-(--zeta-muted)">在当前知识库的已索引分块里召回内容。</p>
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
                分块 #{{ hit.position + 1 }}，{{ hit.charCount }} 字符
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
          <h2 class="m-0 text-xl font-bold">{{ selectedDocument.name }} 的分块</h2>
          <p class="mt-2.5 text-(--zeta-muted)">{{ selectedDocument.chunkCount }} 个分块</p>
        </div>
        <el-button @click="selectedDocument = null">收起</el-button>
      </header>

      <div v-if="chunksLoading" class="grid min-h-24 place-items-center text-(--zeta-muted)">分块加载中</div>
      <div v-else class="grid max-h-130 gap-3.5 overflow-auto p-4.5">
        <article v-for="chunk in chunks" :key="chunk.id"
          class="grid gap-2.5 rounded-lg border border-(--zeta-line) bg-(--zeta-panel) p-3.5">
          <header class="flex justify-between gap-3">
            <strong>#{{ chunk.position + 1 }}</strong>
            <span class="text-(--zeta-muted)">{{ chunk.charCount }} 字符</span>
          </header>
          <p class="m-0 whitespace-pre-wrap text-(--zeta-content) leading-7">{{ chunk.content }}</p>
        </article>
      </div>
    </section>
    <el-dialog v-model="formOpen" title="新增文本知识" width="760px">
      <el-form label-position="top" @submit.prevent="saveDocument">
        <div class="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <el-form-item label="文档名称">
            <el-input v-model="form.name" />
          </el-form-item>
          <el-form-item label="描述">
            <el-input v-model="form.description" />
          </el-form-item>
          <el-form-item class="md:col-span-2" label="正文">
            <el-input v-model="form.content" :rows="12" type="textarea" />
          </el-form-item>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="formOpen = false">取消</el-button>
        <el-button :loading="saving" type="primary" @click="saveDocument">保存并索引</el-button>
      </template>
    </el-dialog>
  </div>
</template>
