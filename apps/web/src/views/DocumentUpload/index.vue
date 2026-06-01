<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CheckIcon, FileCheckIcon, PlusIcon, TrashIcon, UploadIcon } from '@lucide/vue'
import { Icon } from '@iconify/vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { getKnowledgeBase, type KnowledgeBase } from '@/apis/knowledge-bases'
import {
  createFileDocuments,
  previewDocumentFiles,
  type ChunkDraftPayload,
  type ChunkStatus,
  type FileSourceFormat,
  type KnowledgeDocument,
} from '@/apis/knowledge-docs'
import { showErrorMessage } from '@/utils/feedback'

defineOptions({
  name: 'KnowledgeDocumentUploadView',
})

type ChunkForm = {
  title: string
  content: string
  status: ChunkStatus
  metadata?: Record<string, unknown>
}

type UploadForm = {
  fileIndex: number
  fileName: string
  sourceFormat: FileSourceFormat
  name: string
  description: string
  chunks: ChunkForm[]
}

type UploadMode = 'TEXT' | 'TABLE'

const MAX_DOCUMENT_FILE_SIZE = 2 * 1024 * 1024
const MAX_DOCUMENT_FILE_COUNT = 10
const TEXT_EXTENSIONS = ['.md', '.markdown', '.txt', '.html', '.htm', '.pdf', '.docx']
const TABLE_EXTENSIONS = ['.csv', '.xlsx', '.xls']

const route = useRoute()
const router = useRouter()
const knowledgeBaseId = computed(() => String(route.params.knowledgeBaseId ?? ''))

const knowledgeBase = ref<KnowledgeBase | null>(null)
const activeStep = ref(0)
const loading = ref(false)
const previewing = ref(false)
const saving = ref(false)
const isDragging = ref(false)
const uploadMode = ref<UploadMode>('TEXT')
const selectedFiles = ref<File[]>([])
const activeFileIndex = ref(0)
const savedDocuments = ref<KnowledgeDocument[]>([])
const fileInput = ref<HTMLInputElement | null>(null)

const forms = ref<UploadForm[]>([])

const currentForm = computed(() => forms.value[activeFileIndex.value] ?? null)
const acceptedExtensions = computed(() =>
  uploadMode.value === 'TABLE' ? TABLE_EXTENSIONS : TEXT_EXTENSIONS,
)
const acceptedFileAccept = computed(() => acceptedExtensions.value.join(','))
const uploadModeDescription = computed(() =>
  uploadMode.value === 'TABLE'
    ? '支持 .csv / .xlsx / .xls 表格文件，最多 10 个，每个最大 2MB。第一行作为表头，后续每行会转换为可检索分段。'
    : '支持 .md / .markdown / .txt / .html / .htm / .pdf / .docx 文件，最多 10 个，每个最大 2MB。PDF 文本优先结构化解析；扫描件会保留页面图，配置视觉模型后生成图片理解分段。',
)
const uploadModeHint = computed(() =>
  uploadMode.value === 'TABLE'
    ? '最多 10 个，每个最大 2MB，第一行作为表头'
    : '最多 10 个，每个最大 2MB，支持图片资产保留',
)
const imageUnderstandingNotice = computed(() => {
  if (uploadMode.value !== 'TEXT') {
    return ''
  }

  return knowledgeBase.value?.visionModel
    ? `已启用图片理解模型：${knowledgeBase.value.visionModel.name}。DOCX 图片和扫描 PDF 页面图会生成额外分段。`
    : '当前知识库未配置图片理解模型：DOCX 图片和扫描 PDF 页面图会保留并可预览，但不会生成图片理解分段。'
})

const canImport = computed(
  () =>
    selectedFiles.value.length > 0 &&
    forms.value.length === selectedFiles.value.length &&
    forms.value.every(
      (form) =>
        form.name.trim().length > 0 &&
        form.chunks.some((chunk) => chunk.status === 'ACTIVE' && chunk.content.trim().length > 0),
    ),
)

const activeChunkCount = computed(
  () => currentForm.value?.chunks.filter((chunk) => chunk.status === 'ACTIVE').length ?? 0,
)

const createEmptyChunk = (content = ''): ChunkForm => ({
  title: '',
  content,
  status: 'ACTIVE',
})

const resetPreviewDraft = () => {
  forms.value = []
  activeFileIndex.value = 0
  savedDocuments.value = []
}

const loadKnowledgeBase = async () => {
  loading.value = true

  try {
    knowledgeBase.value = await getKnowledgeBase(knowledgeBaseId.value)
  } catch (cause) {
    showErrorMessage(cause, '加载知识库失败')
  } finally {
    loading.value = false
  }
}

const resetUpload = () => {
  selectedFiles.value = []
  resetPreviewDraft()
  activeStep.value = 0

  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const setUploadMode = (mode: UploadMode) => {
  if (uploadMode.value === mode) {
    return
  }

  uploadMode.value = mode
  resetUpload()
}

const handleUploadModeChange = (value: unknown) => {
  if (value === 'TEXT' || value === 'TABLE') {
    setUploadMode(value)
  }
}

const openFilePicker = () => {
  fileInput.value?.click()
}

const handleFileInputChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  await handleSelectedFiles(Array.from(input.files ?? []))
  input.value = ''
}

const handleDrop = async (event: DragEvent) => {
  isDragging.value = false
  await handleSelectedFiles(Array.from(event.dataTransfer?.files ?? []))
}

const handleSelectedFiles = async (files: File[]) => {
  if (files.length === 0) {
    return
  }

  const invalidFile = files.find((file) => !isSupportedFile(file))

  if (invalidFile) {
    showErrorMessage(
      new Error(`仅支持 ${acceptedExtensions.value.join('、')} 文件`),
      '文件格式不支持',
    )
    return
  }

  const emptyFile = files.find((file) => file.size === 0)

  if (emptyFile) {
    showErrorMessage(new Error('文档文件不能为空'), '文件不能为空')
    return
  }

  const oversizedFile = files.find((file) => file.size > MAX_DOCUMENT_FILE_SIZE)

  if (oversizedFile) {
    showErrorMessage(new Error('单个文档文件不能超过 2MB'), '文件过大')
    return
  }

  const nextFiles = [...selectedFiles.value]
  const selectedFileKeys = new Set(nextFiles.map(getFileKey))

  for (const file of files) {
    const key = getFileKey(file)

    if (!selectedFileKeys.has(key)) {
      nextFiles.push(file)
      selectedFileKeys.add(key)
    }
  }

  if (nextFiles.length > MAX_DOCUMENT_FILE_COUNT) {
    showErrorMessage(
      new Error(`一次最多上传 ${MAX_DOCUMENT_FILE_COUNT} 个文件`),
      '文件数量超出限制',
    )
    return
  }

  if (nextFiles.length === selectedFiles.value.length) {
    return
  }

  selectedFiles.value = nextFiles
  resetPreviewDraft()
}

const removeSelectedFile = (index: number) => {
  selectedFiles.value.splice(index, 1)
  resetPreviewDraft()
}

const previewSelectedFiles = async () => {
  if (selectedFiles.value.length === 0) {
    showErrorMessage(new Error('请先选择文档文件'), '缺少文件')
    return
  }

  previewing.value = true

  try {
    const preview = await previewDocumentFiles(knowledgeBaseId.value, selectedFiles.value)
    forms.value = preview.files.map((file) => ({
      fileIndex: file.fileIndex,
      fileName: file.fileName,
      sourceFormat: file.sourceFormat,
      name: file.documentName,
      description: '',
      chunks: file.chunks.map(toChunkForm),
    }))
    activeFileIndex.value = 0
    activeStep.value = 1
  } catch (cause) {
    showErrorMessage(cause, '解析文档失败')
    resetPreviewDraft()
  } finally {
    previewing.value = false
  }
}

const addChunk = () => {
  currentForm.value?.chunks.push(createEmptyChunk())
}

const removeChunk = (index: number) => {
  const form = currentForm.value

  if (!form) {
    return
  }

  if (form.chunks.length === 1) {
    form.chunks[0] = createEmptyChunk()
    return
  }

  form.chunks.splice(index, 1)
}

const importDocument = async () => {
  if (selectedFiles.value.length === 0) {
    showErrorMessage(new Error('请先上传文档文件'), '缺少文件')
    return
  }

  saving.value = true

  try {
    const result = await createFileDocuments(
      knowledgeBaseId.value,
      selectedFiles.value,
      forms.value.map((form) => ({
        fileIndex: form.fileIndex,
        name: form.name,
        description: form.description || undefined,
        chunks: form.chunks.map(toChunkPayload),
      })),
    )
    savedDocuments.value = result.documents
    activeStep.value = 2
  } catch (cause) {
    showErrorMessage(cause, '保存文档失败')
  } finally {
    saving.value = false
  }
}

const goBack = async () => {
  await router.push({
    name: 'knowledge-documents',
    params: {
      knowledgeBaseId: knowledgeBaseId.value,
    },
  })
}

const viewParagraph = async () => {
  const firstDocument = savedDocuments.value[0]

  if (!firstDocument) {
    return
  }

  await router.push({
    name: 'paragraph',
    params: {
      knowledgeBaseId: knowledgeBaseId.value,
      documentId: firstDocument.id,
    },
  })
}

const toChunkPayload = (chunk: ChunkForm): ChunkDraftPayload => ({
  title: chunk.title || undefined,
  content: chunk.content,
  status: chunk.status,
  metadata: chunk.metadata,
})

const toChunkForm = (chunk: ChunkDraftPayload): ChunkForm => ({
  title: chunk.title ?? '',
  content: chunk.content,
  status: chunk.status ?? 'ACTIVE',
  metadata: chunk.metadata,
})

const isSupportedFile = (file: File) => {
  const fileName = file.name.toLowerCase()

  return acceptedExtensions.value.some((extension) => fileName.endsWith(extension))
}

const getFileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`

const formatFileSize = (size: number) => {
  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

const getFileExtension = (fileName: string) => fileName.split('.').pop()?.trim().toLowerCase() || ''

const getFileExtensionLabel = (fileName: string) => {
  const extension = getFileExtension(fileName)

  return extension ? extension.toUpperCase() : 'FILE'
}

const getFileIcon = (fileName: string) => {
  const extension = getFileExtension(fileName)

  return (
    {
      pdf: 'vscode-icons:file-type-pdf2',
      docx: 'vscode-icons:file-type-word',
      doc: 'vscode-icons:file-type-word',
      xlsx: 'vscode-icons:file-type-excel',
      xls: 'vscode-icons:file-type-excel',
      csv: 'vscode-icons:file-type-csv',
      md: 'vscode-icons:file-type-markdown',
      markdown: 'vscode-icons:file-type-markdown',
      html: 'vscode-icons:file-type-html',
      htm: 'vscode-icons:file-type-html',
      txt: 'vscode-icons:file-type-text',
    }[extension] || 'vscode-icons:default-file'
  )
}

const sourceFormatText = (format: FileSourceFormat) =>
  ({
    MARKDOWN: 'Markdown',
    TEXT: '文本',
    HTML: 'HTML',
    PDF: 'PDF',
    DOCX: 'Word',
    CSV: 'CSV',
    EXCEL: 'Excel',
  })[format]

onMounted(loadKnowledgeBase)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col bg-background text-foreground">
    <Card class="min-h-0 flex-1 gap-0 overflow-hidden p-0">
      <CardContent class="min-h-0 flex-1 overflow-hidden p-0">
        <div v-if="loading" class="grid gap-4 p-6">
          <Skeleton class="h-10 w-48" />
          <Skeleton class="h-80 w-full" />
        </div>

        <div v-else-if="activeStep === 0" class="flex min-h-0 flex-1 flex-col overflow-auto p-6">
          <section class="mx-auto flex w-full max-w-280 flex-col gap-5 py-3">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0 flex-1">
                <h2 class="m-0 text-lg font-semibold">上传文档</h2>
                <p class="m-0 mt-2 text-sm text-muted-foreground">
                  选择文本文件或表格文件，系统会先解析为可编辑分段草稿。
                </p>
              </div>

              <ToggleGroup
                :model-value="uploadMode"
                type="single"
                variant="outline"
                class="w-fit"
                @update:model-value="handleUploadModeChange"
              >
                <ToggleGroupItem value="TEXT">文本文件</ToggleGroupItem>
                <ToggleGroupItem value="TABLE">表格</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div class="grid gap-3" :class="imageUnderstandingNotice ? 'lg:grid-cols-2' : ''">
              <Alert>
                <AlertTitle>{{
                  uploadMode === 'TABLE' ? '表格解析规则' : '文本文件解析规则'
                }}</AlertTitle>
                <AlertDescription>{{ uploadModeDescription }}</AlertDescription>
              </Alert>

              <Alert v-if="imageUnderstandingNotice" variant="default">
                <AlertTitle>图片理解</AlertTitle>
                <AlertDescription>{{ imageUnderstandingNotice }}</AlertDescription>
              </Alert>
            </div>

            <button
              type="button"
              class="mx-auto grid min-h-80 w-full content-center justify-items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-8 text-center transition-colors hover:border-primary hover:bg-muted/50 lg:w-[70%]"
              :class="isDragging ? 'border-primary bg-muted/60' : ''"
              @click="openFilePicker"
              @dragenter.prevent="isDragging = true"
              @dragover.prevent="isDragging = true"
              @dragleave.prevent="isDragging = false"
              @drop.prevent="handleDrop"
            >
              <UploadIcon class="size-10 text-primary" />
              <span class="text-base font-medium">拖入文档文件，或点击选择</span>
              <span class="text-sm text-muted-foreground">{{ uploadModeHint }}</span>
              <span
                v-if="selectedFiles.length > 0"
                class="max-w-full truncate text-xs text-muted-foreground"
              >
                已选择 {{ selectedFiles.length }} 个文件
              </span>
            </button>

            <input
              ref="fileInput"
              class="sr-only"
              type="file"
              multiple
              :accept="acceptedFileAccept"
              @change="handleFileInputChange"
            />

            <div v-if="selectedFiles.length > 0" class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <article
                v-for="(file, index) in selectedFiles"
                :key="getFileKey(file)"
                class="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground"
              >
                <div class="grid size-12 shrink-0 place-items-center">
                  <Icon :icon="getFileIcon(file.name)" class="size-11" aria-hidden="true" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="m-0 truncate text-sm font-medium" :title="file.name">
                    {{ file.name }}
                  </p>
                  <div class="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{{ formatFileSize(file.size) }}</span>
                    <Badge variant="secondary">{{ getFileExtensionLabel(file.name) }}</Badge>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  :aria-label="`移除 ${file.name}`"
                  @click.stop="removeSelectedFile(index)"
                >
                  <TrashIcon />
                </Button>
              </article>
            </div>

            <div v-if="previewing" class="grid gap-3 rounded-lg border border-border p-4">
              <Skeleton class="h-4 w-32" />
              <Skeleton class="h-4 w-full" />
              <Skeleton class="h-4 w-2/3" />
            </div>
          </section>
        </div>

        <div
          v-else-if="activeStep === 1"
          class="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden lg:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-none"
        >
          <aside
            class="flex min-h-0 flex-col border-b border-border bg-muted/30 p-5 lg:border-b-0 lg:border-r"
          >
            <h2 class="m-0 text-lg font-semibold">设置分段规则</h2>
            <p class="m-0 mt-2 text-sm text-muted-foreground">
              当前使用自动解析结果生成分段草稿，确认前可以继续编辑每个分段。
            </p>

            <div class="mt-5 grid gap-4">
              <section class="rounded-lg border border-primary bg-card p-4">
                <div class="flex items-start gap-3">
                  <span class="mt-1 size-2 rounded-full bg-primary" />
                  <div class="min-w-0">
                    <h3 class="m-0 text-base font-medium">智能分段（推荐）</h3>
                    <p class="m-0 mt-2 text-sm text-muted-foreground">
                      系统会根据文件格式、标题结构、表格行和解析结果自动生成分段。
                    </p>
                  </div>
                </div>
              </section>

              <section class="rounded-lg border border-border bg-card p-4 opacity-70">
                <div class="flex items-start gap-3">
                  <span class="mt-1 size-2 rounded-full border border-border" />
                  <div class="min-w-0">
                    <h3 class="m-0 text-base font-medium">高级分段</h3>
                    <p class="m-0 mt-2 text-sm text-muted-foreground">
                      后续可扩展自定义分段标识、长度和清洗规则；本轮暂不开放配置。
                    </p>
                  </div>
                </div>
              </section>

              <Alert>
                <AlertTitle>预览说明</AlertTitle>
                <AlertDescription>
                  右侧可按文件切换分段预览。修改文档信息或分段内容后，确认入库时会按当前草稿保存。
                </AlertDescription>
              </Alert>
            </div>

            <div
              class="mt-auto rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground"
            >
              <p class="m-0">文件数量：{{ forms.length }}</p>
              <p class="m-0 mt-1">当前分段：{{ currentForm?.chunks.length ?? 0 }}</p>
              <p class="m-0 mt-1">启用分段：{{ activeChunkCount }}</p>
            </div>
          </aside>

          <section v-if="currentForm" class="flex min-w-0 min-h-0 flex-col">
            <header class="flex flex-col gap-3 border-b border-border bg-card px-4 py-3">
              <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 class="m-0 text-base font-semibold">分段预览</h2>
                  <p class="m-0 mt-1 text-sm text-muted-foreground">
                    共 {{ currentForm.chunks.length }} 段，当前文件：{{ currentForm.fileName }}
                  </p>
                </div>
                <Button variant="outline" @click="addChunk">
                  <PlusIcon data-icon="inline-start" />
                  添加分段
                </Button>
              </div>

              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                  v-for="(item, index) in forms"
                  :key="item.fileIndex"
                  type="button"
                  variant="outline"
                  size="sm"
                  class="max-w-full justify-start"
                  :class="
                    index === activeFileIndex
                      ? 'border-primary bg-muted text-foreground'
                      : 'bg-card'
                  "
                  @click="activeFileIndex = index"
                >
                  <Icon :icon="getFileIcon(item.fileName)" data-icon="inline-start" />
                  <span class="max-w-56 truncate">{{ item.fileName }}</span>
                  <Badge variant="secondary">{{ sourceFormatText(item.sourceFormat) }}</Badge>
                </Button>
              </div>

              <div>
                <p class="m-0 mt-1 text-sm text-muted-foreground">
                  当前来源：{{ currentForm.fileName }} ·
                  {{ sourceFormatText(currentForm.sourceFormat) }}
                </p>
              </div>
            </header>

            <div class="min-h-0 flex-1 overflow-auto">
              <div class="grid gap-3 p-4">
                <section class="rounded-lg border border-border bg-card p-3">
                  <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                    <div class="grid gap-2">
                      <Label for="document-name">文档名称</Label>
                      <Input id="document-name" v-model="currentForm.name" />
                    </div>
                    <div class="grid gap-2">
                      <Label for="source-format">来源类型</Label>
                      <Input
                        id="source-format"
                        :model-value="sourceFormatText(currentForm.sourceFormat)"
                        disabled
                      />
                    </div>
                    <div class="grid gap-2 md:col-span-2">
                      <Label for="document-description">描述</Label>
                      <Textarea
                        id="document-description"
                        v-model="currentForm.description"
                        rows="2"
                      />
                    </div>
                  </div>
                </section>

                <article
                  v-for="(chunk, index) in currentForm.chunks"
                  :key="`${currentForm.fileIndex}-${index}`"
                  class="rounded-lg border border-border bg-card p-3"
                >
                  <header class="mb-3 flex items-center justify-between gap-3">
                    <strong>分段 #{{ index + 1 }}</strong>
                    <Button
                      variant="destructive"
                      size="icon"
                      type="button"
                      :aria-label="`删除分段 ${index + 1}`"
                      @click="removeChunk(index)"
                    >
                      <TrashIcon />
                    </Button>
                  </header>
                  <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
                    <div class="grid gap-2">
                      <Label :for="`chunk-title-${index}`">标题</Label>
                      <Input :id="`chunk-title-${index}`" v-model="chunk.title" />
                    </div>
                    <div class="grid gap-2">
                      <Label :for="`chunk-status-${index}`">状态</Label>
                      <Select v-model="chunk.status">
                        <SelectTrigger :id="`chunk-status-${index}`" class="w-full">
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
                      <Label :for="`chunk-content-${index}`">内容</Label>
                      <Textarea :id="`chunk-content-${index}`" v-model="chunk.content" rows="7" />
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </section>
        </div>

        <div v-else class="grid min-h-0 flex-1 place-items-center p-6">
          <div class="grid max-w-md justify-items-center gap-4 text-center">
            <div class="grid size-16 place-items-center rounded-full bg-primary/10 text-primary">
              <CheckIcon class="size-8" />
            </div>
            <div>
              <h2 class="m-0 text-2xl font-semibold">文档已入库</h2>
              <p class="m-0 mt-2 text-sm text-muted-foreground">
                已保存 {{ savedDocuments.length }} 个文档，后续可在文档列表或分段页继续维护。
              </p>
            </div>
            <div class="flex flex-wrap justify-center gap-2">
              <Button variant="outline" @click="goBack">返回文档列表</Button>
              <Button @click="viewParagraph">
                <FileCheckIcon data-icon="inline-start" />
                查看分段
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <footer
      v-if="activeStep !== 2"
      class="fixed inset-x-0 bottom-0 z-30 flex justify-end gap-2 border-t border-border bg-card px-6 py-4"
    >
      <Button variant="outline" @click="goBack">取消</Button>
      <Button v-if="activeStep === 1" variant="outline" @click="activeStep = 0">上一步</Button>
      <Button
        v-if="activeStep === 0"
        :disabled="selectedFiles.length === 0 || previewing"
        @click="previewSelectedFiles"
      >
        {{ previewing ? '解析中...' : '下一步' }}
      </Button>
      <Button v-else :disabled="!canImport || saving" @click="importDocument">
        {{ saving ? '保存中...' : '确认入库' }}
      </Button>
    </footer>
  </div>
</template>
