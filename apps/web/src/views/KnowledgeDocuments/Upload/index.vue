<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { UploadFile, UploadFiles, UploadUserFile } from 'element-plus'
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
  createMarkdownDocument,
  previewMarkdownDocument,
  type ChunkDraftPayload,
  type ChunkStatus,
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
}

type UploadForm = {
  name: string
  description: string
  chunks: ChunkForm[]
}

const MAX_MARKDOWN_FILE_SIZE = 2 * 1024 * 1024

const route = useRoute()
const router = useRouter()
const knowledgeBaseId = computed(() => String(route.params.knowledgeBaseId ?? ''))

const knowledgeBase = ref<KnowledgeBase | null>(null)
const activeStep = ref(0)
const loading = ref(false)
const previewing = ref(false)
const saving = ref(false)
const markdownFile = ref<File | null>(null)
const uploadFiles = ref<UploadUserFile[]>([])
const savedDocument = ref<KnowledgeDocument | null>(null)

const form = reactive<UploadForm>({
  name: '',
  description: '',
  chunks: [],
})

const canImport = computed(
  () =>
    Boolean(markdownFile.value) &&
    form.name.trim().length > 0 &&
    form.chunks.some((chunk) => chunk.status === 'ACTIVE' && chunk.content.trim().length > 0),
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
  markdownFile.value = null
  uploadFiles.value = []
  Object.assign(form, {
    name: '',
    description: '',
    chunks: [],
  })
  activeStep.value = 0
}

const handleFileChange = async (uploadFile: UploadFile, files: UploadFiles) => {
  const rawFile = uploadFile.raw

  if (!rawFile) {
    return
  }

  uploadFiles.value = files.slice(-1) as UploadUserFile[]

  if (!isMarkdownFile(rawFile)) {
    showErrorMessage(new Error('仅支持 .md 或 .markdown 文件'), '文件格式不支持')
    resetUpload()
    return
  }

  if (rawFile.size === 0) {
    showErrorMessage(new Error('Markdown 文件不能为空'), '文件不能为空')
    resetUpload()
    return
  }

  if (rawFile.size > MAX_MARKDOWN_FILE_SIZE) {
    showErrorMessage(new Error('Markdown 文件不能超过 2MB'), '文件过大')
    resetUpload()
    return
  }

  markdownFile.value = rawFile
  previewing.value = true

  try {
    const preview = await previewMarkdownDocument(knowledgeBaseId.value, rawFile)
    Object.assign(form, {
      name: preview.documentName,
      description: '',
      chunks: preview.chunks.map(toChunkForm),
    })
    activeStep.value = 1
  } catch (cause) {
    showErrorMessage(cause, '解析 Markdown 失败')
    resetUpload()
  } finally {
    previewing.value = false
  }
}

const handleFileExceed = () => {
  showErrorMessage(new Error('一次只能上传一个 Markdown 文件'), '文件数量超出限制')
}

const addChunk = () => {
  form.chunks.push(createEmptyChunk())
}

const removeChunk = (index: number) => {
  if (form.chunks.length === 1) {
    form.chunks[0] = createEmptyChunk()
    return
  }

  form.chunks.splice(index, 1)
}

const importDocument = async () => {
  if (!markdownFile.value) {
    showErrorMessage(new Error('请先上传 Markdown 文件'), '缺少文件')
    return
  }

  saving.value = true

  try {
    savedDocument.value = await createMarkdownDocument(
      knowledgeBaseId.value,
      markdownFile.value,
      {
        name: form.name,
        description: form.description || undefined,
        chunks: form.chunks.map(toChunkPayload),
      },
    )
    activeStep.value = 2
  } catch (cause) {
    showErrorMessage(cause, '保存 Markdown 文档失败')
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
  if (!savedDocument.value) {
    return
  }

  await router.push({
    name: 'paragraph',
    params: {
      knowledgeBaseId: knowledgeBaseId.value,
      documentId: savedDocument.value.id,
    },
  })
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

onMounted(loadKnowledgeBase)
</script>

<template>
  <div class="grid min-h-full grid-rows-[auto_minmax(0,1fr)] gap-4 pb-20" v-loading="loading">
    <header class="flex min-w-0 items-center gap-2">
      <el-button :icon="ArrowLeft" text @click="goBack" />
      <h1 class="m-0 truncate text-xl font-semibold text-(--zeta-ink)">上传文档</h1>
    </header>

    <el-card :body-style="{ padding: '0' }" shadow="never" class="min-h-0 overflow-hidden">
      <div class="border-b border-(--zeta-line-soft) bg-(--zeta-surface) px-4 py-3">
        <el-steps :active="activeStep" finish-status="success" simple>
          <el-step title="选择文件" />
          <el-step title="调整分段" />
          <el-step title="入库完成" />
        </el-steps>
      </div>

      <div v-if="activeStep === 0" class="grid gap-5 p-6">
        <section class="mx-auto grid w-full max-w-[1120px] gap-5 py-3">
          <div>
            <h2 class="m-0 border-l-3 border-(--zeta-blue) pl-3 text-lg font-semibold text-(--zeta-ink)">
              上传文档
            </h2>
          </div>

          <div class="rounded-md bg-(--zeta-blue-soft) px-4 py-3 text-sm leading-6 text-(--zeta-content)">
            支持单个 .md / .markdown 文件，最大 2MB。上传后会先解析成分段草稿，不会立即入库。
          </div>

          <el-upload
            v-model:file-list="uploadFiles"
            accept=".md,.markdown"
            action="#"
            drag
            class="mx-auto w-full lg:w-[70%]"
            :auto-upload="false"
            :limit="1"
            :on-change="handleFileChange"
            :on-exceed="handleFileExceed"
            :on-remove="resetUpload"
          >
            <div class="grid min-h-[220px] justify-items-center gap-3 py-8">
              <el-icon class="text-4xl text-(--zeta-blue)">
                <Upload />
              </el-icon>
              <div class="text-base font-medium text-(--zeta-ink)">
                拖入 Markdown 文件，或点击选择
              </div>
              <small class="text-(--zeta-muted)">最大 2MB，解析后进入分段预览</small>
            </div>
          </el-upload>
        </section>

        <el-empty v-if="previewing" description="正在解析 Markdown..." />
      </div>

      <div
        v-else-if="activeStep === 1"
        class="grid min-h-[620px] grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]"
        v-loading="previewing"
      >
        <aside class="border-b border-(--zeta-line-soft) bg-(--zeta-surface-tint) p-5 lg:border-b-0 lg:border-r">
          <h2 class="m-0 text-lg font-semibold text-(--zeta-ink)">文档信息</h2>
          <p class="m-0 mt-2 text-sm text-(--zeta-muted)">
            确认入库前可以调整文档名称和分段内容。
          </p>

          <el-form class="mt-5" label-position="top">
            <el-form-item label="文档名称">
              <el-input v-model="form.name" />
            </el-form-item>
            <el-form-item label="描述">
              <el-input v-model="form.description" :rows="4" type="textarea" />
            </el-form-item>
          </el-form>

          <div class="rounded-lg border border-(--zeta-line-soft) bg-(--zeta-panel) p-3 text-sm text-(--zeta-muted)">
            <p class="m-0">分段数量：{{ form.chunks.length }}</p>
            <p class="m-0 mt-1">
              启用分段：{{ form.chunks.filter((chunk) => chunk.status === 'ACTIVE').length }}
            </p>
          </div>
        </aside>

        <section class="min-w-0">
          <header
            class="flex flex-col justify-between gap-3 border-b border-(--zeta-line-soft) bg-(--zeta-surface) px-4 py-3 sm:flex-row sm:items-center"
          >
            <div>
              <h2 class="m-0 text-base font-semibold text-(--zeta-ink)">分段草稿</h2>
              <p class="m-0 mt-1 text-sm text-(--zeta-muted)">
                用户确认后的分段才会写入知识库索引。
              </p>
            </div>
            <el-button :icon="Plus" @click="addChunk">添加分段</el-button>
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
                    @click="removeChunk(index)"
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

      <div v-else class="grid min-h-[520px] place-items-center p-6">
        <div class="grid max-w-md justify-items-center gap-4 text-center">
          <div class="grid size-16 place-items-center rounded-full bg-(--zeta-success-soft) text-(--zeta-success)">
            <el-icon class="text-3xl">
              <Check />
            </el-icon>
          </div>
          <div>
            <h2 class="m-0 text-2xl font-semibold text-(--zeta-ink)">文档已入库</h2>
            <p class="m-0 mt-2 text-sm text-(--zeta-muted)">
              {{ savedDocument?.name }} 已完成保存，后续可在分段页继续维护。
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

    <footer
      v-if="activeStep !== 2"
      class="fixed inset-x-0 bottom-0 z-30 flex justify-end gap-2 border-t border-(--zeta-line-soft) bg-(--zeta-panel) px-6 py-4"
    >
      <el-button @click="goBack">取消</el-button>
      <el-button v-if="activeStep === 1" @click="activeStep = 0">上一步</el-button>
      <el-button
        v-if="activeStep === 0"
        :disabled="form.chunks.length === 0"
        :loading="previewing"
        type="primary"
        @click="activeStep = 1"
      >
        下一步
      </el-button>
      <el-button
        v-else
        :disabled="!canImport"
        :loading="saving"
        type="primary"
        @click="importDocument"
      >
        确认入库
      </el-button>
    </footer>
  </div>
</template>
