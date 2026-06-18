<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CheckIcon, PlusIcon, XIcon } from '@lucide/vue'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
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
import PaginationBar from '@/components/common/PaginationBar.vue'
import { getKnowledgeBase, type KnowledgeBase } from '@/apis/knowledge-bases'
import {
  createManualDocument,
  deleteDocument,
  listDocuments,
  updateDocument,
  type DocumentStatus,
  type KnowledgeDocument,
} from '@/apis/knowledge-docs'
import { showErrorMessage } from '@/utils/feedback'

defineOptions({
  name: 'KnowledgeDocumentsView',
})

const route = useRoute()
const router = useRouter()
const knowledgeBaseId = computed(() => String(route.params.knowledgeBaseId ?? ''))

const knowledgeBase = ref<KnowledgeBase | null>(null)
const documents = ref<KnowledgeDocument[]>([])
const loading = ref(false)
const documentPage = ref(1)
const documentPageSize = 20
const documentTotal = ref(0)
const documentKeyword = ref('')
const documentStatusFilter = ref<DocumentStatus | ''>('')
const editOpen = ref(false)
const editingDocumentId = ref<string | null>(null)
const editSaving = ref(false)
const deleteOpen = ref(false)
const deleting = ref(false)
const deletingDocument = ref<KnowledgeDocument | null>(null)
const quickCreateOpen = ref(false)
const quickCreateSaving = ref(false)
const quickDocumentName = ref('')

const editForm = reactive({
  name: '',
  description: '',
})

const documentStatusOptions: Array<{ label: string; value: DocumentStatus }> = [
  { label: '草稿', value: 'DRAFT' },
  { label: '已上传', value: 'UPLOADED' },
  { label: '解析中', value: 'PARSING' },
  { label: '等待 OCR', value: 'OCR_PENDING' },
  { label: 'OCR 处理中', value: 'OCR_PROCESSING' },
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

const indexedCount = computed(
  () => documents.value.filter((document) => document.status === 'INDEXED').length,
)

const totalChunks = computed(() =>
  documents.value.reduce((total, document) => total + document.chunkCount, 0),
)

const loadDocumentsPage = async () => {
  const pageResult = await listDocuments(knowledgeBaseId.value, {
    page: documentPage.value,
    pageSize: documentPageSize,
    keyword: documentKeyword.value.trim() || undefined,
    status: documentStatusFilter.value || 'ALL',
  })
  documents.value = pageResult.items
  documentTotal.value = pageResult.total
  documentPage.value = pageResult.page
}

const load = async () => {
  loading.value = true

  try {
    const [knowledgeBaseDetail] = await Promise.all([
      getKnowledgeBase(knowledgeBaseId.value),
      loadDocumentsPage(),
    ])
    knowledgeBase.value = knowledgeBaseDetail
  } catch (cause) {
    showErrorMessage(cause, '加载文档失败')
  } finally {
    loading.value = false
  }
}

const openMarkdownUpload = () => {
  void router.push({
    name: 'knowledge-document-upload',
    params: {
      knowledgeBaseId: knowledgeBaseId.value,
    },
  })
}

const openQuickCreate = () => {
  quickDocumentName.value = ''
  quickCreateOpen.value = true
}

const cancelQuickCreate = () => {
  quickDocumentName.value = ''
  quickCreateOpen.value = false
}

const createBlankDocument = async () => {
  const name = quickDocumentName.value.trim()

  if (!name) {
    return
  }

  quickCreateSaving.value = true

  try {
    await createManualDocument(knowledgeBaseId.value, {
      name,
      chunks: [],
    })
    documentPage.value = 1
    await loadDocumentsPage()
    cancelQuickCreate()
  } catch (cause) {
    showErrorMessage(cause, '创建文档失败')
  } finally {
    quickCreateSaving.value = false
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
    await loadDocumentsPage()
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

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const statusText = (status: DocumentStatus) =>
  ({
    DRAFT: '草稿',
    UPLOADED: '已上传',
    PARSING: '解析中',
    OCR_PENDING: '等待 OCR',
    OCR_PROCESSING: 'OCR 处理中',
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

  if (status === 'DRAFT' || status === 'UPLOADED') {
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

const changeDocumentPage = async (page: number) => {
  documentPage.value = page
  loading.value = true

  try {
    await loadDocumentsPage()
  } catch (cause) {
    showErrorMessage(cause, '加载文档失败')
  } finally {
    loading.value = false
  }
}

watch([documentKeyword, documentStatusFilter], () => {
  documentPage.value = 1
  void load()
})

onMounted(load)
</script>

<template>
  <div class="grid gap-4 p-4 lg:p-6">
    <header class="flex flex-wrap items-center gap-2">
      <Badge variant="outline" class="max-w-full truncate">
        {{ knowledgeBase?.name || '知识库' }}
      </Badge>
      <Badge variant="secondary">文档 {{ documentTotal }}</Badge>
      <Badge variant="secondary">当前页已索引 {{ indexedCount }} / {{ documents.length }}</Badge>
      <Badge variant="secondary">当前页分段 {{ totalChunks }}</Badge>
    </header>

    <section
      class="min-w-0 overflow-hidden rounded-lg border border-border bg-card text-card-foreground"
    >
      <div
        class="flex flex-col justify-between gap-3 border-b border-border bg-muted/30 p-4 lg:flex-row lg:items-center"
      >
        <div class="flex flex-wrap items-center gap-2">
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
            当前页 {{ documents.length }} / {{ documentTotal }}
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
          <TableRow v-else-if="documents.length === 0">
            <TableCell colspan="7" class="h-24 text-center text-muted-foreground">
              还没有文档
            </TableCell>
          </TableRow>
          <template v-else>
            <TableRow
              v-for="document in documents"
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
      <PaginationBar
        :page="documentPage"
        :page-size="documentPageSize"
        :total="documentTotal"
        :disabled="loading"
        @update:page="changeDocumentPage"
      />

      <div class="border-t border-border bg-muted/20 p-3">
        <form
          v-if="quickCreateOpen"
          class="flex flex-col gap-2 sm:flex-row sm:items-center"
          @submit.prevent="createBlankDocument"
        >
          <Input
            v-model="quickDocumentName"
            autofocus
            placeholder="请输入文档名称"
            class="sm:max-w-120"
          />
          <div class="flex gap-2">
            <Button
              type="submit"
              :disabled="quickCreateSaving || !quickDocumentName.trim()"
              size="sm"
            >
              <CheckIcon data-icon="inline-start" />
              {{ quickCreateSaving ? '创建中...' : '创建' }}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="quickCreateSaving"
              @click="cancelQuickCreate"
            >
              <XIcon data-icon="inline-start" />
              取消
            </Button>
          </div>
        </form>
        <Button
          v-else
          type="button"
          variant="ghost"
          class="w-full justify-start"
          @click="openQuickCreate"
        >
          <PlusIcon data-icon="inline-start" />
          新增文档
        </Button>
      </div>
    </section>

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
