<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PlusIcon, TrashIcon } from '@lucide/vue'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogScrollContent,
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
import { showErrorMessage } from '@/utils/feedback'

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
const deleteOpen = ref(false)
const deleting = ref(false)
const deletingDocument = ref<KnowledgeDocument | null>(null)

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

const documentStatusFilterValue = computed({
  get: () => documentStatusFilter.value || 'ALL',
  set: (value: string) => {
    documentStatusFilter.value = value === 'ALL' ? '' : (value as DocumentStatus)
  },
})

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

const removeDocument = (document: KnowledgeDocument) => {
  deletingDocument.value = document
  deleteOpen.value = true
}

const confirmRemoveDocument = async () => {
  if (!deletingDocument.value) {
    return
  }

  deleting.value = true

  try {
    await deleteDocument(deletingDocument.value.id)
    documents.value = documents.value.filter((item) => item.id !== deletingDocument.value?.id)
    deleteOpen.value = false
    deletingDocument.value = null
  } catch (cause) {
    showErrorMessage(cause, '删除文档失败')
  } finally {
    deleting.value = false
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
          <Select v-model="documentStatusFilterValue">
            <SelectTrigger class="w-full sm:w-36">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="ALL">全部状态</SelectItem>
                <SelectItem
                  v-for="status in documentStatusOptions"
                  :key="status.value"
                  :value="status.value"
                >
                  {{ status.label }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
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

    <Dialog v-model:open="formOpen">
      <DialogScrollContent class="max-h-[calc(100vh-2rem)] overflow-hidden sm:max-w-280">
        <DialogHeader>
          <DialogTitle>新增文本知识</DialogTitle>
          <DialogDescription>
            直接录入文本并调整分段，保存后会写入文档、分段和索引。
          </DialogDescription>
        </DialogHeader>

        <form
          class="grid max-h-[calc(100vh-220px)] min-h-0 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]"
          @submit.prevent="saveDocument"
        >
          <aside class="grid content-start gap-4">
            <Card>
              <CardHeader>
                <CardTitle class="text-base">文档信息</CardTitle>
              </CardHeader>
              <CardContent class="grid gap-3">
                <div class="grid gap-2">
                  <Label for="manual-document-name">文档名称</Label>
                  <Input id="manual-document-name" v-model="form.name" />
                </div>
                <div class="grid gap-2">
                  <Label for="manual-document-description">描述</Label>
                  <Textarea id="manual-document-description" v-model="form.description" rows="3" />
                </div>
              </CardContent>
            </Card>
          </aside>

          <section
            class="flex min-w-0 min-h-0 flex-col overflow-hidden rounded-lg border border-border"
          >
            <header
              class="flex flex-col justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center"
            >
              <div>
                <h3 class="m-0 text-base font-semibold">分段预览</h3>
                <p class="m-0 mt-1 text-sm text-muted-foreground">
                  {{ form.chunks.length }} 个分段
                </p>
              </div>
              <Button type="button" variant="outline" @click="addFormChunk">
                <PlusIcon data-icon="inline-start" />
                添加分段
              </Button>
            </header>

            <div class="min-h-0 flex-1 overflow-auto">
              <div class="grid gap-3 p-4">
                <article
                  v-for="(chunk, index) in form.chunks"
                  :key="index"
                  class="rounded-lg border border-border bg-card p-3"
                >
                  <header class="mb-3 flex items-center justify-between gap-3">
                    <strong>分段 #{{ index + 1 }}</strong>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      :aria-label="`删除分段 ${index + 1}`"
                      @click="removeFormChunk(index)"
                    >
                      <TrashIcon />
                    </Button>
                  </header>
                  <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
                    <div class="grid gap-2">
                      <Label :for="`manual-chunk-title-${index}`">标题</Label>
                      <Input :id="`manual-chunk-title-${index}`" v-model="chunk.title" />
                    </div>
                    <div class="grid gap-2">
                      <Label :for="`manual-chunk-status-${index}`">状态</Label>
                      <Select v-model="chunk.status">
                        <SelectTrigger :id="`manual-chunk-status-${index}`" class="w-full">
                          <SelectValue placeholder="请选择状态" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="ACTIVE">启用</SelectItem>
                            <SelectItem value="DISABLED">停用</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    <div class="grid gap-2 md:col-span-2">
                      <Label :for="`manual-chunk-content-${index}`">内容</Label>
                      <Textarea
                        :id="`manual-chunk-content-${index}`"
                        v-model="chunk.content"
                        rows="7"
                      />
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </section>
        </form>

        <DialogFooter>
          <Button variant="outline" @click="formOpen = false">取消</Button>
          <Button :disabled="!canSaveDocument || saving" @click="saveDocument">
            {{ saving ? '保存中...' : '保存并索引' }}
          </Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>

    <Dialog v-model:open="editOpen">
      <DialogContent class="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>编辑文档</DialogTitle>
          <DialogDescription>修改文档名称和描述，不会重切已有分段。</DialogDescription>
        </DialogHeader>

        <form class="grid gap-4" @submit.prevent="saveDocumentMeta">
          <div class="grid gap-2">
            <Label for="edit-document-name">文档名称</Label>
            <Input id="edit-document-name" v-model="editForm.name" />
          </div>
          <div class="grid gap-2">
            <Label for="edit-document-description">描述</Label>
            <Textarea id="edit-document-description" v-model="editForm.description" rows="4" />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" @click="editOpen = false">取消</Button>
          <Button :disabled="editSaving" @click="saveDocumentMeta">
            {{ editSaving ? '保存中...' : '保存' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog v-model:open="deleteOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除文档</AlertDialogTitle>
          <AlertDialogDescription>
            删除文档「{{ deletingDocument?.name }}」？对应分段、向量和源文件也会同步清理。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="deleting">取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            :disabled="deleting"
            @click.prevent="confirmRemoveDocument"
          >
            {{ deleting ? '删除中...' : '删除' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
