<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Delete, Plus } from '@element-plus/icons-vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getKnowledgeBase, type KnowledgeBase } from '@/apis/knowledge-bases'
import {
  createManualDocument,
  deleteDocument,
  listDocuments,
  updateDocument,
  type ChunkDraftPayload,
  type ChunkStatus,
  type DocumentStatus,
  type KnowledgeDocument,
  type ManualDocumentPayload,
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

const editForm = reactive({
  name: '',
  description: '',
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
  void router.push({
    name: 'knowledge-document-upload',
    params: {
      knowledgeBaseId: knowledgeBaseId.value,
    },
  })
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

const toChunkPayload = (chunk: ChunkForm): ChunkDraftPayload => ({
  title: chunk.title || undefined,
  content: chunk.content,
  status: chunk.status,
})

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

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

const statusBadgeVariant = (
  status: DocumentStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'INDEXED') {
    return 'default'
  }

  if (status === 'FAILED' || status === 'DISABLED') {
    return 'destructive'
  }

  if (status === 'UPLOADED') {
    return 'outline'
  }

  return 'secondary'
}

const sourceText = (document: KnowledgeDocument) =>
  ({
    MANUAL: '手动录入',
    FILE_UPLOAD: '文件导入',
    AI_EXTRACTED: 'AI 提炼',
    WEB_IMPORT: '网页导入',
  })[document.sourceType]

onMounted(load)
</script>

<template>
  <div class="grid gap-4 p-4 lg:p-6">
    <header class="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
      <div class="flex min-w-0 items-start gap-3">
        <Button variant="outline" size="sm" @click="router.push({ name: 'knowledge-bases' })">
          返回
        </Button>
        <div class="min-w-0">
          <p class="m-0 text-sm text-muted-foreground">知识库 / 文档</p>
          <h1 class="m-0 mt-1 truncate text-2xl font-semibold text-foreground">文档</h1>
          <div class="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline">{{ knowledgeBase?.name || '知识库' }}</Badge>
            <Badge variant="secondary">已索引 {{ indexedCount }} / {{ documents.length }}</Badge>
            <Badge variant="secondary">分段 {{ totalChunks }}</Badge>
          </div>
        </div>
      </div>
    </header>

    <section
      class="min-w-0 overflow-hidden rounded-lg border border-border bg-card text-card-foreground"
    >
      <div
        class="flex flex-col justify-between gap-3 border-b border-border bg-muted/30 p-4 lg:flex-row lg:items-center"
      >
        <div class="flex flex-wrap items-center gap-2">
          <Button @click="openCreate">新增文本知识</Button>
          <Button variant="outline" @click="openMarkdownUpload">上传文档</Button>
          <Button variant="outline" :disabled="loading" @click="load">
            {{ loading ? '刷新中' : '刷新' }}
          </Button>
          <Button
            variant="outline"
            @click="router.push({ name: 'knowledge-retrieval', params: { knowledgeBaseId } })"
          >
            检索测试
          </Button>
          <span class="text-sm text-muted-foreground">
            当前 {{ filteredDocuments.length }} / {{ documents.length }}
          </span>
        </div>
        <div class="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <select
            v-model="documentStatusFilter"
            class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-36"
          >
            <option value="">全部状态</option>
            <option
              v-for="status in documentStatusOptions"
              :key="status.value"
              :value="status.value"
            >
              {{ status.label }}
            </option>
          </select>
          <Input v-model="documentKeyword" placeholder="搜索文档" class="w-full sm:w-64" />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow class="bg-muted/60 hover:bg-muted/60">
            <TableHead class="min-w-70">文档名称</TableHead>
            <TableHead class="min-w-34">状态</TableHead>
            <TableHead class="min-w-24">字符数</TableHead>
            <TableHead class="min-w-24">分段数</TableHead>
            <TableHead class="min-w-30">来源</TableHead>
            <TableHead class="min-w-36">更新时间</TableHead>
            <TableHead class="min-w-36 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="loading">
            <TableCell colspan="7" class="h-24 text-center text-muted-foreground">
              正在加载文档...
            </TableCell>
          </TableRow>
          <TableRow v-else-if="filteredDocuments.length === 0">
            <TableCell colspan="7" class="h-24 text-center text-muted-foreground">
              还没有文档
            </TableCell>
          </TableRow>
          <template v-else>
            <TableRow
              v-for="document in filteredDocuments"
              :key="document.id"
              class="cursor-pointer"
              @click="openParagraph(document)"
            >
              <TableCell>
                <div class="grid gap-1">
                  <button
                    type="button"
                    class="w-fit text-left font-semibold text-primary hover:underline"
                    @click.stop="openParagraph(document)"
                  >
                    {{ document.name }}
                  </button>
                  <small class="text-muted-foreground">
                    {{ document.description || sourceText(document) }}
                  </small>
                </div>
              </TableCell>
              <TableCell>
                <div class="grid gap-1">
                  <Badge :variant="statusBadgeVariant(document.status)">
                    {{ statusText(document.status) }}
                  </Badge>
                  <small v-if="document.errorMessage" class="text-destructive">
                    {{ document.errorMessage }}
                  </small>
                </div>
              </TableCell>
              <TableCell class="text-muted-foreground">{{ document.charCount }}</TableCell>
              <TableCell class="text-muted-foreground">{{ document.chunkCount }}</TableCell>
              <TableCell>
                <Badge variant="outline">{{ sourceText(document) }}</Badge>
              </TableCell>
              <TableCell class="text-muted-foreground">
                {{ formatTime(document.updatedAt) }}
              </TableCell>
              <TableCell>
                <div class="flex justify-end gap-2">
                  <Button variant="outline" size="sm" @click.stop="openEditDocument(document)">
                    编辑
                  </Button>
                  <Button variant="destructive" size="sm" @click.stop="removeDocument(document)">
                    删除
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
    </section>

    <el-dialog v-model="formOpen" title="新增文本知识" width="min(1120px, calc(100vw - 32px))">
      <el-form label-position="top" @submit.prevent="saveDocument">
        <div
          class="grid max-h-[calc(100vh-220px)] min-h-0 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]"
        >
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

          <section
            class="flex min-w-0 min-h-0 flex-col overflow-hidden rounded-lg border border-(--zeta-line)"
          >
            <header
              class="flex flex-col justify-between gap-3 border-b border-(--zeta-line-soft) bg-(--zeta-surface) px-4 py-3 sm:flex-row sm:items-center"
            >
              <div>
                <h3 class="m-0 text-base font-semibold">分段预览</h3>
                <p class="m-0 mt-1 text-sm text-(--zeta-muted)">{{ form.chunks.length }} 个分段</p>
              </div>
              <el-button :icon="Plus" @click="addFormChunk">添加分段</el-button>
            </header>

            <div class="min-h-0 flex-1 overflow-auto">
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
            </div>
          </section>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="formOpen = false">取消</el-button>
        <el-button
          :disabled="!canSaveDocument"
          :loading="saving"
          type="primary"
          @click="saveDocument"
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
  </div>
</template>
