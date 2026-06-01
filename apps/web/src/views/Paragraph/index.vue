<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from '@lucide/vue'
import { MdEditor } from 'md-editor-v3'
import { VueDraggable } from 'vue-draggable-plus'
import 'md-editor-v3/lib/style.css'
import MarkdownPreview from '@/components/markdown/MarkdownPreview.vue'
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
import { Card } from '@/components/ui/card'
import {
  Dialog,
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
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  createDocumentChunk,
  deleteDocumentChunk,
  getDocument,
  listDocumentChunks,
  reorderDocumentChunks,
  updateDocumentChunk,
  type ChunkStatus,
  type KnowledgeChunk,
  type KnowledgeDocument,
} from '@/apis/knowledge-docs'
import { showErrorMessage } from '@/utils/feedback'

defineOptions({
  name: 'ParagraphView',
})

type DialogMode = 'view' | 'edit' | 'add'

type ChunkForm = {
  title: string
  content: string
  status: ChunkStatus
}

const route = useRoute()
const router = useRouter()
const knowledgeBaseId = computed(() => String(route.params.knowledgeBaseId ?? ''))
const documentId = computed(() => String(route.params.documentId ?? ''))

const documentDetail = ref<KnowledgeDocument | null>(null)
const chunks = ref<KnowledgeChunk[]>([])
const loading = ref(false)
const ordering = ref(false)
const searchText = ref('')
const searchType = ref<'title' | 'content'>('title')
const sidebarCollapsed = ref(false)
const hoveredChunkId = ref<string | null>(null)
const dialogOpen = ref(false)
const dialogMode = ref<DialogMode>('view')
const chunkEditingId = ref<string | null>(null)
const afterChunkId = ref<string | null>(null)
const chunkSaving = ref(false)
const highlightedChunkId = ref('')
const deleteOpen = ref(false)
const deletingChunk = ref<KnowledgeChunk | null>(null)
const chunkDeleting = ref(false)
let highlightTimer: ReturnType<typeof setTimeout> | null = null

const chunkForm = reactive<ChunkForm>({
  title: '',
  content: '',
  status: 'ACTIVE',
})

const visibleChunkCount = computed(() => chunks.value.filter((chunk) => matchesChunk(chunk)).length)

const dialogTitle = computed(() => {
  if (dialogMode.value === 'add') {
    return '新增分段'
  }

  if (dialogMode.value === 'edit') {
    return '编辑分段'
  }

  return '分段详情'
})

const load = async () => {
  loading.value = true

  try {
    const [documentResult, chunkList] = await Promise.all([
      getDocument(documentId.value),
      listDocumentChunks(documentId.value),
    ])
    documentDetail.value = documentResult
    chunks.value = chunkList
  } catch (cause) {
    showErrorMessage(cause, '加载分段失败')
  } finally {
    loading.value = false
  }
}

const focusChunkFromQuery = async () => {
  const chunkId = typeof route.query.chunkId === 'string' ? route.query.chunkId : ''

  if (!chunkId) {
    return
  }

  await nextTick()
  scrollToChunk(chunkId)
  highlightedChunkId.value = chunkId

  if (highlightTimer) {
    clearTimeout(highlightTimer)
  }

  highlightTimer = setTimeout(() => {
    if (highlightedChunkId.value === chunkId) {
      highlightedChunkId.value = ''
    }
  }, 2600)
}

const refreshDocument = async () => {
  documentDetail.value = await getDocument(documentId.value)
}

const openViewChunk = (chunk: KnowledgeChunk) => {
  Object.assign(chunkForm, {
    title: chunk.title ?? '',
    content: chunk.content,
    status: chunk.status,
  })
  chunkEditingId.value = chunk.id
  afterChunkId.value = null
  dialogMode.value = 'view'
  dialogOpen.value = true
}

const openEditChunk = (chunk: KnowledgeChunk) => {
  Object.assign(chunkForm, {
    title: chunk.title ?? '',
    content: chunk.content,
    status: chunk.status,
  })
  chunkEditingId.value = chunk.id
  afterChunkId.value = null
  dialogMode.value = 'edit'
  dialogOpen.value = true
}

const openCreateChunk = (previousChunk?: KnowledgeChunk) => {
  Object.assign(chunkForm, {
    title: '',
    content: '',
    status: 'ACTIVE' as ChunkStatus,
  })
  chunkEditingId.value = null
  afterChunkId.value = previousChunk?.id ?? null
  dialogMode.value = 'add'
  dialogOpen.value = true
}

const saveChunk = async () => {
  chunkSaving.value = true

  try {
    if (dialogMode.value === 'edit' && chunkEditingId.value) {
      const updated = await updateDocumentChunk(chunkEditingId.value, {
        title: chunkForm.title || undefined,
        content: chunkForm.content,
        status: chunkForm.status,
      })
      replaceChunk(updated)
    } else {
      await createDocumentChunk(documentId.value, {
        title: chunkForm.title || undefined,
        content: chunkForm.content,
        status: chunkForm.status,
        afterChunkId: afterChunkId.value,
      })
      chunks.value = await listDocumentChunks(documentId.value)
    }

    await refreshDocument()
    dialogOpen.value = false
  } catch (cause) {
    showErrorMessage(cause, '保存分段失败')
  } finally {
    chunkSaving.value = false
  }
}

const toggleChunk = async (chunk: KnowledgeChunk, isActive: boolean) => {
  try {
    const updated = await updateDocumentChunk(chunk.id, {
      status: isActive ? 'ACTIVE' : 'DISABLED',
    })
    replaceChunk(updated)
    await refreshDocument()
  } catch (cause) {
    showErrorMessage(cause, '更新分段状态失败')
  }
}

const removeChunk = (chunk: KnowledgeChunk) => {
  deletingChunk.value = chunk
  deleteOpen.value = true
}

const confirmRemoveChunk = async () => {
  if (!deletingChunk.value) {
    return
  }

  chunkDeleting.value = true

  try {
    await deleteDocumentChunk(deletingChunk.value.id)
    chunks.value = await listDocumentChunks(documentId.value)
    await refreshDocument()
    deleteOpen.value = false
    deletingChunk.value = null
  } catch (cause) {
    showErrorMessage(cause, '删除分段失败')
  } finally {
    chunkDeleting.value = false
  }
}

const saveOrder = async () => {
  if (searchText.value.trim()) {
    return
  }

  ordering.value = true

  try {
    chunks.value = await reorderDocumentChunks(documentId.value, {
      chunkIds: chunks.value.map((chunk) => chunk.id),
    })
  } catch (cause) {
    showErrorMessage(cause, '保存分段顺序失败')
    chunks.value = await listDocumentChunks(documentId.value)
  } finally {
    ordering.value = false
  }
}

const replaceChunk = (updated: KnowledgeChunk) => {
  const index = chunks.value.findIndex((chunk) => chunk.id === updated.id)

  if (index >= 0) {
    chunks.value[index] = updated
  }
}

const matchesChunk = (chunk: KnowledgeChunk) => {
  const query = searchText.value.trim().toLowerCase()

  if (!query) {
    return true
  }

  const target = searchType.value === 'title' ? chunk.title || '' : chunk.content

  return target.toLowerCase().includes(query)
}

const scrollToChunk = (chunkId: string) => {
  document.getElementById(`chunk-${chunkId}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const chunkStatusText = (status: ChunkStatus) => (status === 'ACTIVE' ? '启用' : '停用')

const chunkStatusVariant = (status: ChunkStatus) => (status === 'ACTIVE' ? 'default' : 'secondary')

watch(
  () => route.query.chunkId,
  () => {
    void focusChunkFromQuery()
  },
)

onMounted(async () => {
  await load()
  await focusChunkFromQuery()
})

onBeforeUnmount(() => {
  if (highlightTimer) {
    clearTimeout(highlightTimer)
  }
})
</script>

<template>
  <div class="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4 p-4 lg:p-6">
    <header class="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
      <div class="flex min-w-0 items-start gap-3">
        <Button
          variant="outline"
          size="icon"
          @click="
            router.push({
              name: 'knowledge-documents',
              params: { knowledgeBaseId },
            })
          "
        >
          <ArrowLeftIcon />
          <span class="sr-only">返回文档列表</span>
        </Button>
        <div class="min-w-0">
          <p class="m-0 text-sm text-muted-foreground">文档 / 分段</p>
          <h1 class="m-0 mt-1 truncate text-2xl font-semibold text-foreground">
            {{ documentDetail?.name || '分段' }}
          </h1>
          <div class="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline"
              >{{ documentDetail?.chunkCount ?? chunks.length }} 个分段</Badge
            >
            <Badge variant="secondary"> {{ documentDetail?.charCount ?? 0 }} 字符 </Badge>
            <Badge v-if="documentDetail" variant="secondary">
              更新于 {{ formatTime(documentDetail.updatedAt) }}
            </Badge>
          </div>
        </div>
      </div>
      <Button :disabled="loading" @click="openCreateChunk()">
        <PlusIcon data-icon="inline-start" />
        新增分段
      </Button>
    </header>

    <Card class="min-h-0 gap-0 overflow-hidden p-0">
      <div
        class="flex flex-col justify-between gap-3 border-b border-border bg-muted/30 p-4 lg:flex-row lg:items-center"
      >
        <span class="text-sm text-muted-foreground">
          {{ ordering ? '正在保存排序...' : `${visibleChunkCount} / ${chunks.length} 个分段` }}
        </span>
        <div class="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <Select v-model="searchType">
            <SelectTrigger class="w-full sm:w-28">
              <SelectValue placeholder="搜索范围" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="title">标题</SelectItem>
                <SelectItem value="content">内容</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <div class="relative w-full lg:w-72">
            <SearchIcon
              class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input v-model="searchText" placeholder="搜索" class="pl-9" />
          </div>
        </div>
      </div>

      <div
        class="relative grid min-h-0 flex-1 grid-cols-1"
        :class="
          sidebarCollapsed ? 'lg:grid-cols-[0_minmax(0,1fr)]' : 'lg:grid-cols-[220px_minmax(0,1fr)]'
        "
      >
        <aside
          class="hidden min-h-0 overflow-hidden border-r border-border bg-muted/30 p-4 transition-[width,padding] lg:flex lg:flex-col"
          :class="sidebarCollapsed ? 'w-0 border-r-0 p-0' : 'w-[220px]'"
        >
          <div class="min-h-0 flex-1 overflow-auto">
            <div class="grid gap-1">
              <button
                v-for="chunk in chunks.filter((item) => item.title && matchesChunk(item))"
                :key="chunk.id"
                class="w-full truncate rounded-md border-0 bg-transparent px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                type="button"
                @click="scrollToChunk(chunk.id)"
              >
                {{ chunk.title }}
              </button>
            </div>
          </div>
        </aside>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                class="absolute top-6 hidden shadow-sm lg:inline-flex"
                :class="sidebarCollapsed ? 'left-3' : 'left-[207px]'"
                variant="outline"
                size="icon-sm"
                @click="sidebarCollapsed = !sidebarCollapsed"
              >
                <ChevronRightIcon v-if="sidebarCollapsed" />
                <ChevronLeftIcon v-else />
                <span class="sr-only">{{ sidebarCollapsed ? '展开目录' : '收起目录' }}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {{ sidebarCollapsed ? '展开目录' : '收起目录' }}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <main class="min-h-0 min-w-0 overflow-auto bg-background p-4">
          <div v-if="loading" class="grid gap-4">
            <Skeleton v-for="index in 3" :key="index" class="h-36 rounded-lg" />
          </div>
          <div
            v-else-if="chunks.length === 0"
            class="grid min-h-72 place-items-center rounded-lg border border-dashed border-border bg-card p-8 text-center"
          >
            <div class="grid gap-3">
              <h2 class="m-0 text-lg font-semibold text-foreground">暂无分段</h2>
              <p class="m-0 text-sm text-muted-foreground">
                创建第一个分段后，这份文档就可以被检索和引用。
              </p>
              <Button class="mx-auto" @click="openCreateChunk()">
                <PlusIcon data-icon="inline-start" />
                新增分段
              </Button>
            </div>
          </div>
          <div
            v-else-if="visibleChunkCount === 0"
            class="grid min-h-72 place-items-center rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground"
          >
            没有匹配的分段
          </div>

          <VueDraggable
            v-else
            v-model="chunks"
            :animation="150"
            :disabled="Boolean(searchText.trim())"
            handle=".chunk-drag-handle"
            @end="saveOrder"
          >
            <article
              v-for="chunk in chunks"
              v-show="matchesChunk(chunk)"
              :id="`chunk-${chunk.id}`"
              :key="chunk.id"
              class="group relative mb-4 scroll-mt-4 cursor-pointer rounded-lg border border-border bg-card p-4 shadow-none transition-colors duration-300 hover:border-primary/40"
              :class="[
                chunk.status === 'DISABLED' ? 'opacity-60' : '',
                highlightedChunkId === chunk.id
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : '',
              ]"
              @click="openViewChunk(chunk)"
              @mouseenter="hoveredChunkId = chunk.id"
              @mouseleave="hoveredChunkId = null"
            >
              <div
                v-if="hoveredChunkId === chunk.id"
                class="absolute right-3 top-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm"
                @click.stop
              >
                <Switch
                  :modelValue="chunk.status === 'ACTIVE'"
                  size="sm"
                  @update:modelValue="(value) => toggleChunk(chunk, Boolean(value))"
                />
                <Button variant="ghost" size="icon-sm" @click="openEditChunk(chunk)">
                  <PencilIcon />
                  <span class="sr-only">编辑分段</span>
                </Button>
                <Button variant="ghost" size="icon-sm" @click="openCreateChunk(chunk)">
                  <PlusIcon />
                  <span class="sr-only">在此后新增分段</span>
                </Button>
                <Button variant="ghost" size="icon-sm" @click="removeChunk(chunk)">
                  <TrashIcon />
                  <span class="sr-only">删除分段</span>
                </Button>
              </div>

              <div class="mb-3 flex items-start gap-3">
                <GripVerticalIcon
                  class="chunk-drag-handle mt-1 cursor-grab text-muted-foreground"
                  @click.stop
                />
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="m-0 truncate text-lg font-semibold text-foreground">
                      {{ chunk.title || '-' }}
                    </h2>
                    <Badge :variant="chunkStatusVariant(chunk.status)">
                      {{ chunkStatusText(chunk.status) }}
                    </Badge>
                  </div>
                  <p class="m-0 mt-1 text-sm text-muted-foreground">
                    #{{ chunk.position + 1 }} · {{ chunk.charCount }} 字符
                  </p>
                </div>
              </div>

              <MarkdownPreview
                :editor-id="`chunk-preview-${chunk.id}`"
                :modelValue="chunk.content"
                class="paragraph-md-preview"
              />
            </article>
          </VueDraggable>
        </main>
      </div>
    </Card>

    <Dialog v-model:open="dialogOpen">
      <DialogScrollContent class="max-h-[calc(100vh-2rem)] overflow-hidden sm:max-w-240">
        <DialogHeader>
          <DialogTitle>{{ dialogTitle }}</DialogTitle>
          <DialogDescription>
            {{ dialogMode === 'view' ? '查看当前分段内容。' : '维护分段标题、状态和正文内容。' }}
          </DialogDescription>
        </DialogHeader>

        <template v-if="dialogMode === 'view'">
          <div class="grid gap-4">
            <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h3 class="m-0 text-lg font-semibold text-foreground">
                  {{ chunkForm.title || '-' }}
                </h3>
                <p class="m-0 mt-1 text-sm text-muted-foreground">
                  {{ chunkForm.content.length }} 字符
                </p>
              </div>
              <Button @click="dialogMode = 'edit'">
                <PencilIcon data-icon="inline-start" />
                编辑
              </Button>
            </div>
            <MarkdownPreview
              editor-id="chunk-dialog-preview"
              :modelValue="chunkForm.content"
              class="paragraph-md-preview rounded-lg border border-border p-3"
            />
          </div>
        </template>

        <form v-else class="grid gap-4" @submit.prevent="saveChunk">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
            <div class="grid gap-2">
              <Label for="paragraph-chunk-title">标题</Label>
              <Input id="paragraph-chunk-title" v-model="chunkForm.title" />
            </div>
            <div class="grid gap-2">
              <Label for="paragraph-chunk-status">状态</Label>
              <Select v-model="chunkForm.status">
                <SelectTrigger id="paragraph-chunk-status" class="w-full">
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
              <Label>内容</Label>
              <MdEditor v-model="chunkForm.content" :preview="false" style="height: 420px" />
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" @click="dialogOpen = false">关闭</Button>
          <Button v-if="dialogMode !== 'view'" :disabled="chunkSaving" @click="saveChunk">
            {{ chunkSaving ? '保存中...' : '保存' }}
          </Button>
        </DialogFooter>
      </DialogScrollContent>
    </Dialog>

    <AlertDialog v-model:open="deleteOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除分段</AlertDialogTitle>
          <AlertDialogDescription>
            删除分段「{{
              deletingChunk?.title || (deletingChunk ? `#${deletingChunk.position + 1}` : '')
            }}」？ 关联向量和引用记录也会同步清理。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="chunkDeleting">取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            :disabled="chunkDeleting"
            @click.prevent="confirmRemoveChunk"
          >
            {{ chunkDeleting ? '删除中...' : '删除' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<style scoped>
.paragraph-md-preview {
  background: transparent;
}

.paragraph-md-preview :deep(.md-editor-preview-wrapper) {
  padding: 0;
}

.paragraph-md-preview :deep(.md-editor-preview) {
  color: var(--foreground);
  font-size: 14px;
  line-height: 1.8;
}
</style>
