<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import type { UploadFile, UploadFiles, UploadUserFile } from 'element-plus'
import {
  ArrowLeft,
  Delete,
  DocumentAdd,
  EditPen,
  Plus,
  Refresh,
  Search,
  Upload,
} from '@element-plus/icons-vue'
import { getKnowledgeBase, type KnowledgeBase } from '@/apis/knowledge-bases'
import {
  createMarkdownDocument,
  createManualDocument,
  deleteDocument,
  listDocuments,
  previewMarkdownDocument,
  testKnowledgeBaseRetrieval,
  updateDocument,
  type ChunkDraftPayload,
  type ChunkStatus,
  type DocumentStatus,
  type KnowledgeDocument,
  type ManualDocumentPayload,
  type RetrievalResult,
} from '@/apis/knowledge-docs'
import { isCancelAction, showErrorMessage } from '@/utils/feedback'

defineOptions({
  name: 'KnowledgeDocumentsView',
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
const knowledgeBaseId = computed(() => String(route.params.knowledgeBaseId ?? ''))

const knowledgeBase = ref<KnowledgeBase | null>(null)
const documents = ref<KnowledgeDocument[]>([])
const loading = ref(false)
const saving = ref(false)
const formOpen = ref(false)
const documentKeyword = ref('')
const documentStatusFilter = ref<DocumentStatus | ''>('')
const editOpen = ref(false)
const editingDocumentId = ref<string | null>(null)
const editSaving = ref(false)
const retrievalOpen = ref(false)
const retrieving = ref(false)
const retrievalResult = ref<RetrievalResult | null>(null)
const markdownOpen = ref(false)
const markdownPreviewing = ref(false)
const markdownSaving = ref(false)
const markdownFile = ref<File | null>(null)
const markdownUploadFiles = ref<UploadUserFile[]>([])

const MAX_MARKDOWN_FILE_SIZE = 2 * 1024 * 1024

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

const markdownForm = reactive<DocumentForm>({
  name: '',
  description: '',
  chunks: [],
})

const editForm = reactive({
  name: '',
  description: '',
})

const retrievalForm = reactive({
  question: '',
  topK: 5,
})

const documentStatusOptions: Array<{ label: string; value: DocumentStatus }> = [
  { label: '已上传', value: 'UPLOADED' },
  { label: '解析中', value: 'PARSING' },
  { label: '分段中', value: 'CHUNKING' },
  { label: '向量化', value: 'EMBEDDING' },
  { label: '已索引', value: 'INDEXED' },
  { label: '失败', value: 'FAILED' },
  { label: '停用', value: 'DISABLED' },
]

const filteredDocuments = computed(() => {
  const query = documentKeyword.value.trim().toLowerCase()

  return documents.value.filter((document) => {
    const matchedStatus =
      documentStatusFilter.value === '' || document.status === documentStatusFilter.value
    const searchableText = [
      document.name,
      document.description ?? '',
      sourceText(document),
      statusText(document.status),
      document.errorMessage ?? '',
    ]
      .join(' ')
      .toLowerCase()

    return matchedStatus && (!query || searchableText.includes(query))
  })
})

const indexedCount = computed(
  () => documents.value.filter((document) => document.status === 'INDEXED').length,
)

const totalChunks = computed(() =>
  documents.value.reduce((total, document) => total + document.chunkCount, 0),
)

const canSaveDocument = computed(
  () =>
    form.name.trim().length > 0 &&
    form.chunks.some((chunk) => chunk.status === 'ACTIVE' && chunk.content.trim().length > 0),
)

const canSaveMarkdownDocument = computed(
  () =>
    Boolean(markdownFile.value) &&
    markdownForm.name.trim().length > 0 &&
    markdownForm.chunks.some(
      (chunk) => chunk.status === 'ACTIVE' && chunk.content.trim().length > 0,
    ),
)

const load = async () => {
  loading.value = true

  try {
    const [knowledgeBaseDetail, documentList] = await Promise.all([
      getKnowledgeBase(knowledgeBaseId.value),
      listDocuments(knowledgeBaseId.value),
    ])
    knowledgeBase.value = knowledgeBaseDetail
    documents.value = documentList
  } catch (cause) {
    showErrorMessage(cause, '加载文档失败')
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
  formOpen.value = true
}

const openMarkdownUpload = () => {
  resetMarkdownForm()
  markdownOpen.value = true
}

const resetMarkdownForm = () => {
  markdownFile.value = null
  markdownUploadFiles.value = []
  Object.assign(markdownForm, {
    name: '',
    description: '',
    chunks: [],
  })
}

const addFormChunk = () => {
  form.chunks.push(createEmptyChunk())
}

const addMarkdownChunk = () => {
  markdownForm.chunks.push(createEmptyChunk())
}

const removeFormChunk = (index: number) => {
  if (form.chunks.length === 1) {
    form.chunks[0] = createEmptyChunk()
    return
  }

  form.chunks.splice(index, 1)
}

const removeMarkdownChunk = (index: number) => {
  if (markdownForm.chunks.length === 1) {
    markdownForm.chunks[0] = createEmptyChunk()
    return
  }

  markdownForm.chunks.splice(index, 1)
}

const saveDocument = async () => {
  saving.value = true

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
    showErrorMessage(cause, '保存文档失败')
  } finally {
    saving.value = false
  }
}

const handleMarkdownFileChange = async (uploadFile: UploadFile, uploadFiles: UploadFiles) => {
  const rawFile = uploadFile.raw

  if (!rawFile) {
    return
  }

  markdownUploadFiles.value = uploadFiles.slice(-1) as UploadUserFile[]

  if (!isMarkdownFile(rawFile)) {
    showErrorMessage(new Error('仅支持 .md 或 .markdown 文件'), '文件格式不支持')
    resetMarkdownForm()
    return
  }

  if (rawFile.size === 0) {
    showErrorMessage(new Error('Markdown 文件不能为空'), '文件不能为空')
    resetMarkdownForm()
    return
  }

  if (rawFile.size > MAX_MARKDOWN_FILE_SIZE) {
    showErrorMessage(new Error('Markdown 文件不能超过 2MB'), '文件过大')
    resetMarkdownForm()
    return
  }

  markdownFile.value = rawFile
  markdownPreviewing.value = true

  try {
    const preview = await previewMarkdownDocument(knowledgeBaseId.value, rawFile)
    Object.assign(markdownForm, {
      name: preview.documentName,
      description: '',
      chunks: preview.chunks.map(toChunkForm),
    })
  } catch (cause) {
    showErrorMessage(cause, '解析 Markdown 失败')
    resetMarkdownForm()
  } finally {
    markdownPreviewing.value = false
  }
}

const clearMarkdownFile = () => {
  resetMarkdownForm()
}

const handleMarkdownExceed = () => {
  showErrorMessage(new Error('一次只能上传一个 Markdown 文件'), '文件数量超出限制')
}

const saveMarkdownDocument = async () => {
  if (!markdownFile.value) {
    showErrorMessage(new Error('请先上传 Markdown 文件'), '缺少文件')
    return
  }

  markdownSaving.value = true

  try {
    const saved = await createMarkdownDocument(knowledgeBaseId.value, markdownFile.value, {
      name: markdownForm.name,
      description: markdownForm.description || undefined,
      chunks: markdownForm.chunks.map(toChunkPayload),
    })
    documents.value.unshift(saved)
    markdownOpen.value = false
    resetMarkdownForm()
  } catch (cause) {
    showErrorMessage(cause, '保存 Markdown 文档失败')
  } finally {
    markdownSaving.value = false
  }
}

const openEditDocument = (document: KnowledgeDocument) => {
  editingDocumentId.value = document.id
  Object.assign(editForm, {
    name: document.name,
    description: document.description ?? '',
  })
  editOpen.value = true
}

const saveDocumentMeta = async () => {
  if (!editingDocumentId.value) {
    return
  }

  editSaving.value = true

  try {
    const updated = await updateDocument(editingDocumentId.value, {
      name: editForm.name,
      description: editForm.description || null,
    })
    const index = documents.value.findIndex((document) => document.id === updated.id)

    if (index >= 0) {
      documents.value[index] = updated
    }

    editOpen.value = false
  } catch (cause) {
    showErrorMessage(cause, '保存文档信息失败')
  } finally {
    editSaving.value = false
  }
}

const removeDocument = async (document: KnowledgeDocument) => {
  try {
    await ElMessageBox.confirm(`删除文档「${document.name}」？`, '删除文档', {
      cancelButtonText: '取消',
      confirmButtonText: '删除',
      type: 'warning',
    })
    await deleteDocument(document.id)
    documents.value = documents.value.filter((item) => item.id !== document.id)
  } catch (cause) {
    if (isCancelAction(cause)) {
      return
    }

    showErrorMessage(cause, '删除文档失败')
  }
}

const openParagraph = (document: KnowledgeDocument) => {
  void router.push({
    name: 'paragraph',
    params: {
      knowledgeBaseId: knowledgeBaseId.value,
      documentId: document.id,
    },
  })
}

const runRetrieval = async () => {
  retrieving.value = true

  try {
    retrievalResult.value = await testKnowledgeBaseRetrieval(knowledgeBaseId.value, {
      question: retrievalForm.question,
      topK: retrievalForm.topK,
    })
  } catch (cause) {
    showErrorMessage(cause, '检索测试失败')
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

const isMarkdownFile = (file: File) => {
  const fileName = file.name.toLowerCase()

  return fileName.endsWith('.md') || fileName.endsWith('.markdown')
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

const sourceText = (document: KnowledgeDocument) =>
  ({
    MANUAL: '手动录入',
    FILE_UPLOAD: 'Markdown 导入',
    AI_EXTRACTED: 'AI 提炼',
    WEB_IMPORT: '网页导入',
  })[document.sourceType]

onMounted(load)
</script>

<template>
  <div class="grid gap-4">
    <header class="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-end">
      <div class="flex min-w-0 items-start gap-3">
        <el-button :icon="ArrowLeft" circle @click="router.push({ name: 'knowledge-bases' })" />
        <div class="min-w-0">
          <p class="m-0 text-sm text-(--zeta-muted)">知识库 / 文档</p>
          <h1 class="m-0 mt-1 truncate text-2xl font-semibold text-(--zeta-ink)">文档</h1>
          <div class="mt-2 flex flex-wrap gap-2">
            <el-tag effect="plain">{{ knowledgeBase?.name || '知识库' }}</el-tag>
            <el-tag effect="plain" type="success">
              已索引 {{ indexedCount }} / {{ documents.length }}
            </el-tag>
            <el-tag effect="plain" type="info">分段 {{ totalChunks }}</el-tag>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <el-button :icon="Upload" :disabled="loading" @click="openMarkdownUpload">
          上传 Markdown
        </el-button>
        <el-button :icon="DocumentAdd" :disabled="loading" type="primary" @click="openCreate">
          新增文本知识
        </el-button>
      </div>
    </header>

    <el-card :body-style="{ padding: '0' }" shadow="never" class="overflow-hidden">
      <div
        class="flex flex-col justify-between gap-3 border-b border-(--zeta-line-soft) bg-(--zeta-surface) p-4 lg:flex-row lg:items-center"
      >
        <div class="flex flex-wrap items-center gap-2">
          <el-button :icon="DocumentAdd" type="primary" @click="openCreate">新增文本知识</el-button>
          <el-button :icon="Upload" @click="openMarkdownUpload">上传 Markdown</el-button>
          <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
          <el-button @click="retrievalOpen = true">检索测试</el-button>
          <span class="text-sm text-(--zeta-muted)">
            当前 {{ filteredDocuments.length }} / {{ documents.length }}
          </span>
        </div>
        <div class="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <el-select
            v-model="documentStatusFilter"
            clearable
            placeholder="状态"
            class="w-full sm:w-32"
          >
            <el-option
              v-for="status in documentStatusOptions"
              :key="status.value"
              :label="status.label"
              :value="status.value"
            />
          </el-select>
          <el-input
            v-model="documentKeyword"
            :prefix-icon="Search"
            clearable
            placeholder="搜索文档"
            class="w-full sm:w-64"
          />
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="filteredDocuments"
        empty-text="还没有文档"
        @row-click="openParagraph"
      >
        <el-table-column label="文档名称" min-width="280">
          <template #default="{ row }: { row: KnowledgeDocument }">
            <div class="grid gap-1">
              <el-link type="primary" @click.stop="openParagraph(row)">{{ row.name }}</el-link>
              <small class="text-(--zeta-muted)">{{ row.description || sourceText(row) }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="120">
          <template #default="{ row }: { row: KnowledgeDocument }">
            <div class="grid gap-1">
              <el-tag :type="statusClass(row.status)" effect="light">
                {{ statusText(row.status) }}
              </el-tag>
              <small v-if="row.errorMessage" class="text-(--zeta-danger)">
                {{ row.errorMessage }}
              </small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="字符数" min-width="110" prop="charCount" />
        <el-table-column label="分段数" min-width="110" prop="chunkCount" />
        <el-table-column label="来源" min-width="120">
          <template #default="{ row }: { row: KnowledgeDocument }">
            {{ sourceText(row) }}
          </template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="150">
          <template #default="{ row }: { row: KnowledgeDocument }">
            {{ formatTime(row.updatedAt) }}
          </template>
        </el-table-column>
        <el-table-column align="right" fixed="right" label="操作" min-width="150">
          <template #default="{ row }: { row: KnowledgeDocument }">
            <el-button :icon="EditPen" size="small" @click.stop="openEditDocument(row)" />
            <el-button :icon="Delete" size="small" type="danger" @click.stop="removeDocument(row)" />
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="formOpen"
      title="新增文本知识"
      width="min(1120px, calc(100vw - 32px))"
    >
      <el-form label-position="top" @submit.prevent="saveDocument">
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside class="grid content-start gap-4">
            <section class="rounded-lg border border-(--zeta-line) p-4">
              <h3 class="m-0 mb-4 text-base font-semibold">文档信息</h3>
              <el-form-item label="文档名称">
                <el-input v-model="form.name" />
              </el-form-item>
              <el-form-item label="描述">
                <el-input v-model="form.description" :rows="3" type="textarea" />
              </el-form-item>
            </section>

          </aside>

          <section class="min-w-0 overflow-hidden rounded-lg border border-(--zeta-line)">
            <header
              class="flex flex-col justify-between gap-3 border-b border-(--zeta-line-soft) bg-(--zeta-surface) px-4 py-3 sm:flex-row sm:items-center"
            >
              <div>
                <h3 class="m-0 text-base font-semibold">分段预览</h3>
                <p class="m-0 mt-1 text-sm text-(--zeta-muted)">
                  {{ form.chunks.length }} 个分段
                </p>
              </div>
              <el-button :icon="Plus" @click="addFormChunk">添加分段</el-button>
            </header>

            <el-scrollbar height="560px">
              <div class="grid gap-3 p-4">
                <article
                  v-for="(chunk, index) in form.chunks"
                  :key="index"
                  class="rounded-lg border border-(--zeta-line-soft) bg-(--zeta-panel) p-3"
                >
                  <header class="mb-3 flex items-center justify-between gap-3">
                    <strong>分段 #{{ index + 1 }}</strong>
                    <el-button
                      :icon="Delete"
                      size="small"
                      type="danger"
                      @click="removeFormChunk(index)"
                    />
                  </header>
                  <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
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
                      <el-input v-model="chunk.content" :rows="7" type="textarea" />
                    </el-form-item>
                  </div>
                </article>
              </div>
            </el-scrollbar>
          </section>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="formOpen = false">取消</el-button>
        <el-button :disabled="!canSaveDocument" :loading="saving" type="primary" @click="saveDocument">
          保存并索引
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="markdownOpen"
      title="上传 Markdown"
      width="min(1120px, calc(100vw - 32px))"
      @closed="resetMarkdownForm"
    >
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside class="grid content-start gap-4">
          <section class="rounded-lg border border-(--zeta-line) p-4">
            <h3 class="m-0 mb-4 text-base font-semibold">源文件</h3>
            <el-upload
              v-model:file-list="markdownUploadFiles"
              accept=".md,.markdown"
              action="#"
              drag
              :auto-upload="false"
              :limit="1"
              :on-change="handleMarkdownFileChange"
              :on-exceed="handleMarkdownExceed"
              :on-remove="clearMarkdownFile"
            >
              <div class="grid justify-items-center gap-2 py-4">
                <el-icon class="text-3xl text-(--zeta-muted)">
                  <Upload />
                </el-icon>
                <div class="text-sm text-(--zeta-muted)">
                  拖入 Markdown 文件，或点击选择
                </div>
                <small class="text-(--zeta-subtle)">仅支持 .md / .markdown，最大 2MB</small>
              </div>
            </el-upload>
          </section>

          <section class="rounded-lg border border-(--zeta-line) p-4">
            <h3 class="m-0 mb-4 text-base font-semibold">文档信息</h3>
            <el-form label-position="top">
              <el-form-item label="文档名称">
                <el-input v-model="markdownForm.name" :disabled="!markdownFile" />
              </el-form-item>
              <el-form-item label="描述">
                <el-input
                  v-model="markdownForm.description"
                  :disabled="!markdownFile"
                  :rows="3"
                  type="textarea"
                />
              </el-form-item>
            </el-form>
          </section>
        </aside>

        <section class="min-w-0 overflow-hidden rounded-lg border border-(--zeta-line)">
          <header
            class="flex flex-col justify-between gap-3 border-b border-(--zeta-line-soft) bg-(--zeta-surface) px-4 py-3 sm:flex-row sm:items-center"
          >
            <div>
              <h3 class="m-0 text-base font-semibold">分段草稿</h3>
              <p class="m-0 mt-1 text-sm text-(--zeta-muted)">
                {{
                  markdownPreviewing
                    ? '正在解析 Markdown...'
                    : `${markdownForm.chunks.length} 个分段`
                }}
              </p>
            </div>
            <el-button :disabled="!markdownFile" :icon="Plus" @click="addMarkdownChunk">
              添加分段
            </el-button>
          </header>

          <div v-loading="markdownPreviewing">
            <el-empty
              v-if="markdownForm.chunks.length === 0"
              description="上传 Markdown 后会在这里预览分段"
            />
            <el-scrollbar v-else height="560px">
              <div class="grid gap-3 p-4">
                <article
                  v-for="(chunk, index) in markdownForm.chunks"
                  :key="index"
                  class="rounded-lg border border-(--zeta-line-soft) bg-(--zeta-panel) p-3"
                >
                  <header class="mb-3 flex items-center justify-between gap-3">
                    <strong>分段 #{{ index + 1 }}</strong>
                    <el-button
                      :icon="Delete"
                      size="small"
                      type="danger"
                      @click="removeMarkdownChunk(index)"
                    />
                  </header>
                  <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
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
                      <el-input v-model="chunk.content" :rows="7" type="textarea" />
                    </el-form-item>
                  </div>
                </article>
              </div>
            </el-scrollbar>
          </div>
        </section>
      </div>

      <template #footer>
        <el-button @click="markdownOpen = false">取消</el-button>
        <el-button
          :disabled="!canSaveMarkdownDocument"
          :loading="markdownSaving"
          type="primary"
          @click="saveMarkdownDocument"
        >
          保存并索引
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editOpen" title="编辑文档" width="560px">
      <el-form label-position="top" @submit.prevent="saveDocumentMeta">
        <el-form-item label="文档名称">
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" :rows="4" type="textarea" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="editOpen = false">取消</el-button>
        <el-button :loading="editSaving" type="primary" @click="saveDocumentMeta">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="retrievalOpen" title="检索测试" size="420px">
      <el-form class="grid gap-3" label-position="top" @submit.prevent="runRetrieval">
        <el-form-item label="问题">
          <el-input v-model="retrievalForm.question" :rows="4" type="textarea" />
        </el-form-item>
        <el-form-item label="Top K">
          <el-input-number
            v-model="retrievalForm.topK"
            :max="20"
            :min="1"
            controls-position="right"
          />
        </el-form-item>
        <el-button :loading="retrieving" native-type="submit" type="primary">
          测试检索
        </el-button>
      </el-form>

      <div v-if="retrievalResult" class="mt-4 grid gap-3">
        <el-empty v-if="retrievalResult.hits.length === 0" description="暂无命中" />
        <template v-else>
          <article
            v-for="hit in retrievalResult.hits"
            :key="hit.chunkId"
            class="grid gap-2 rounded-lg border border-(--zeta-line-soft) bg-(--zeta-surface-tint) p-3"
          >
            <header class="flex justify-between gap-3">
              <strong class="min-w-0 truncate">{{ hit.documentName }}</strong>
              <el-tag effect="light" type="success">{{ formatScore(hit.score) }}</el-tag>
            </header>
            <p class="m-0 max-h-40 overflow-auto whitespace-pre-wrap text-sm text-(--zeta-content) leading-6">
              {{ hit.content }}
            </p>
            <small class="text-(--zeta-muted)">
              分段 #{{ hit.position + 1 }} · {{ hit.charCount }} 字符
            </small>
          </article>
        </template>
      </div>
    </el-drawer>
  </div>
</template>
