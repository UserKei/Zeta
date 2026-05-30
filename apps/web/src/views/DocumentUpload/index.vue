<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type {
  UploadFile,
  UploadFiles,
  UploadRawFile,
  UploadUserFile,
} from 'element-plus'
import {
  ArrowLeft,
  Check,
  Delete,
  DocumentChecked,
  Plus,
  Upload,
} from '@element-plus/icons-vue'
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
const uploadMode = ref<UploadMode>('TEXT')
const selectedFiles = ref<File[]>([])
const uploadFiles = ref<UploadUserFile[]>([])
const activeFileIndex = ref(0)
const savedDocuments = ref<KnowledgeDocument[]>([])

const forms = ref<UploadForm[]>([])

const currentForm = computed(() => forms.value[activeFileIndex.value] ?? null)
const acceptedExtensions = computed(() =>
  uploadMode.value === 'TABLE' ? TABLE_EXTENSIONS : TEXT_EXTENSIONS,
)
const acceptedFileAccept = computed(() => acceptedExtensions.value.join(','))
const uploadModeDescription = computed(() =>
  uploadMode.value === 'TABLE'
    ? '支持 .csv / .xlsx / .xls 表格文件，最多 10 个，每个最大 2MB。第一行作为表头，后续每行会转换为可检索分段。'
    : '支持 .md / .markdown / .txt / .html / .htm / .pdf / .docx 文件，最多 10 个，每个最大 2MB。PDF 首版仅支持文本型文件，扫描件后续进入 OCR 处理。',
)
const uploadModeHint = computed(() =>
  uploadMode.value === 'TABLE'
    ? '最多 10 个，每个最大 2MB，第一行作为表头'
    : '最多 10 个，每个最大 2MB，PDF 扫描件暂不支持',
)

const canImport = computed(
  () =>
    selectedFiles.value.length > 0 &&
    forms.value.length === selectedFiles.value.length &&
    forms.value.every(
      (form) =>
        form.name.trim().length > 0 &&
        form.chunks.some(
          (chunk) => chunk.status === 'ACTIVE' && chunk.content.trim().length > 0,
        ),
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
  uploadFiles.value = []
  forms.value = []
  activeFileIndex.value = 0
  activeStep.value = 0
}

const setUploadMode = (mode: UploadMode) => {
  if (uploadMode.value === mode) {
    return
  }

  uploadMode.value = mode
  resetUpload()
}

const handleUploadModeChange = (value: string | number | boolean | undefined) => {
  if (value === 'TEXT' || value === 'TABLE') {
    setUploadMode(value)
  }
}

const handleFileChange = async (uploadFile: UploadFile, files: UploadFiles) => {
  const rawFiles = files.reduce<UploadRawFile[]>((result, file) => {
    if (file.raw) {
      result.push(file.raw)
    }

    return result
  }, [])

  if (!uploadFile.raw || rawFiles.length === 0) {
    return
  }

  uploadFiles.value = files as UploadUserFile[]

  if (rawFiles.length > MAX_DOCUMENT_FILE_COUNT) {
    showErrorMessage(
      new Error(`一次最多上传 ${MAX_DOCUMENT_FILE_COUNT} 个文件`),
      '文件数量超出限制',
    )
    resetUpload()
    return
  }

  const invalidFile = rawFiles.find((file) => !isSupportedFile(file))

  if (invalidFile) {
    showErrorMessage(
      new Error(`仅支持 ${acceptedExtensions.value.join('、')} 文件`),
      '文件格式不支持',
    )
    resetUpload()
    return
  }

  const emptyFile = rawFiles.find((file) => file.size === 0)

  if (emptyFile) {
    showErrorMessage(new Error('文档文件不能为空'), '文件不能为空')
    resetUpload()
    return
  }

  const oversizedFile = rawFiles.find((file) => file.size > MAX_DOCUMENT_FILE_SIZE)

  if (oversizedFile) {
    showErrorMessage(new Error('单个文档文件不能超过 2MB'), '文件过大')
    resetUpload()
    return
  }

  selectedFiles.value = rawFiles
  previewing.value = true

  try {
    const preview = await previewDocumentFiles(knowledgeBaseId.value, rawFiles)
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
    resetUpload()
  } finally {
    previewing.value = false
  }
}

const handleFileExceed = () => {
  showErrorMessage(
    new Error(`一次最多上传 ${MAX_DOCUMENT_FILE_COUNT} 个文件`),
    '文件数量超出限制',
  )
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
  <div class="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4 pb-20" v-loading="loading">
    <header class="flex min-w-0 items-center gap-2">
      <el-button :icon="ArrowLeft" text @click="goBack" />
      <h1 class="m-0 truncate text-xl font-semibold text-(--zeta-ink)">上传文档</h1>
    </header>

    <el-card :body-style="{ padding: '0', height: '100%', display: 'flex', flexDirection: 'column' }" shadow="never"
      class="min-h-0 overflow-hidden">
      <div v-if="activeStep === 0" class="flex min-h-0 flex-1 flex-col p-6">
        <section class="mx-auto flex min-h-0 w-full max-w-280 flex-col gap-5 py-3">
          <div>
            <h2 class="m-0 border-l-3 border-(--zeta-blue) pl-3 text-lg font-semibold text-(--zeta-ink)">
              上传文档
            </h2>
          </div>

          <el-radio-group :model-value="uploadMode" @change="handleUploadModeChange">
            <el-radio-button value="TEXT">文本文件</el-radio-button>
            <el-radio-button value="TABLE">表格</el-radio-button>
          </el-radio-group>

          <div class="rounded-md bg-(--zeta-blue-soft) px-4 py-3 text-sm leading-6 text-(--zeta-content)">
            {{ uploadModeDescription }}
          </div>

          <el-upload v-model:file-list="uploadFiles" :accept="acceptedFileAccept" action="#" drag multiple
            class="zeta-upload-dropzone mx-auto flex min-h-80 flex-1 w-full lg:w-[70%]" :auto-upload="false"
            :limit="MAX_DOCUMENT_FILE_COUNT"
            :on-change="handleFileChange" :on-exceed="handleFileExceed" :on-remove="resetUpload">
            <div class="grid h-full min-h-80 content-center justify-items-center gap-3 py-8">
              <el-icon class="text-4xl text-(--zeta-blue)">
                <Upload />
              </el-icon>
              <div class="text-base font-medium text-(--zeta-ink)">
                拖入文档文件，或点击选择
              </div>
              <small class="text-(--zeta-muted)">{{ uploadModeHint }}</small>
            </div>
          </el-upload>
        </section>

        <el-empty v-if="previewing" description="正在解析文档..." />
      </div>

      <div v-else-if="activeStep === 1"
        class="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-none"
        v-loading="previewing">
        <aside
          class="flex min-h-0 flex-col border-b border-(--zeta-line-soft) bg-(--zeta-surface-tint) p-5 lg:border-b-0 lg:border-r">
          <h2 class="m-0 text-lg font-semibold text-(--zeta-ink)">文件列表</h2>
          <p class="m-0 mt-2 text-sm text-(--zeta-muted)">
            选择文件后，在右侧调整文档信息和分段内容。
          </p>

          <div class="mt-5 min-h-0 flex-1 overflow-auto">
            <button v-for="(item, index) in forms" :key="item.fileIndex"
              class="mb-2 grid w-full gap-1 rounded-lg border px-3 py-2 text-left text-sm transition-colors"
              :class="index === activeFileIndex
                ? 'border-(--zeta-blue-line) bg-(--zeta-blue-soft) text-(--zeta-ink)'
                : 'border-(--zeta-line-soft) bg-(--zeta-panel) text-(--zeta-content) hover:border-(--zeta-blue-line)'"
              type="button" @click="activeFileIndex = index">
              <span class="truncate font-medium">{{ item.name || item.fileName }}</span>
              <span class="flex items-center justify-between gap-2 text-xs text-(--zeta-muted)">
                <span class="truncate">{{ item.fileName }}</span>
                <el-tag size="small" effect="light">{{ sourceFormatText(item.sourceFormat) }}</el-tag>
              </span>
            </button>
          </div>

          <div class="rounded-lg border border-(--zeta-line-soft) bg-(--zeta-panel) p-3 text-sm text-(--zeta-muted)">
            <p class="m-0">文件数量：{{ forms.length }}</p>
            <p class="m-0 mt-1">当前分段：{{ currentForm?.chunks.length ?? 0 }}</p>
            <p class="m-0 mt-1">
              启用分段：{{ activeChunkCount }}
            </p>
          </div>
        </aside>

        <section v-if="currentForm" class="flex min-w-0 min-h-0 flex-col">
          <header
            class="flex flex-col justify-between gap-3 border-b border-(--zeta-line-soft) bg-(--zeta-surface) px-4 py-3 sm:flex-row sm:items-center">
            <div>
              <h2 class="m-0 text-base font-semibold text-(--zeta-ink)">分段草稿</h2>
              <p class="m-0 mt-1 text-sm text-(--zeta-muted)">
                当前文件：{{ currentForm.fileName }} · {{ sourceFormatText(currentForm.sourceFormat) }}
              </p>
            </div>
            <el-button :icon="Plus" @click="addChunk">添加分段</el-button>
          </header>

          <div class="min-h-0 flex-1 overflow-auto">
            <div class="grid gap-3 p-4">
              <el-form class="rounded-lg border border-(--zeta-line-soft) bg-(--zeta-panel) p-3" label-position="top">
                <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                  <el-form-item label="文档名称">
                    <el-input v-model="currentForm.name" />
                  </el-form-item>
                  <el-form-item label="来源类型">
                    <el-input :model-value="sourceFormatText(currentForm.sourceFormat)" disabled />
                  </el-form-item>
                  <el-form-item class="md:col-span-2" label="描述">
                    <el-input v-model="currentForm.description" :rows="2" type="textarea" />
                  </el-form-item>
                </div>
              </el-form>

              <article v-for="(chunk, index) in currentForm.chunks" :key="`${currentForm.fileIndex}-${index}`"
                class="rounded-lg border border-(--zeta-line-soft) bg-(--zeta-panel) p-3">
                <header class="mb-3 flex items-center justify-between gap-3">
                  <strong>分段 #{{ index + 1 }}</strong>
                  <el-button :icon="Delete" size="small" type="danger" @click="removeChunk(index)" />
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

      <div v-else class="grid min-h-0 flex-1 place-items-center p-6">
        <div class="grid max-w-md justify-items-center gap-4 text-center">
          <div class="grid size-16 place-items-center rounded-full bg-(--zeta-success-soft) text-(--zeta-success)">
            <el-icon class="text-3xl">
              <Check />
            </el-icon>
          </div>
          <div>
            <h2 class="m-0 text-2xl font-semibold text-(--zeta-ink)">文档已入库</h2>
            <p class="m-0 mt-2 text-sm text-(--zeta-muted)">
              已保存 {{ savedDocuments.length }} 个文档，后续可在文档列表或分段页继续维护。
            </p>
          </div>
          <div class="flex flex-wrap justify-center gap-2">
            <el-button @click="goBack">返回文档列表</el-button>
            <el-button :icon="DocumentChecked" type="primary" @click="viewParagraph">
              查看分段
            </el-button>
          </div>
        </div>
      </div>
    </el-card>

    <footer v-if="activeStep !== 2"
      class="fixed inset-x-0 bottom-0 z-30 flex justify-end gap-2 border-t border-(--zeta-line-soft) bg-(--zeta-panel) px-6 py-4">
      <el-button @click="goBack">取消</el-button>
      <el-button v-if="activeStep === 1" @click="activeStep = 0">上一步</el-button>
      <el-button v-if="activeStep === 0" :disabled="forms.length === 0" :loading="previewing" type="primary"
        @click="activeStep = 1">
        下一步
      </el-button>
      <el-button v-else :disabled="!canImport" :loading="saving" type="primary" @click="importDocument">
        确认入库
      </el-button>
    </footer>
  </div>
</template>

<style scoped>
.zeta-upload-dropzone :deep(.el-upload) {
  display: flex;
  flex: 1;
  width: 100%;
}

.zeta-upload-dropzone :deep(.el-upload-dragger) {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
}
</style>
