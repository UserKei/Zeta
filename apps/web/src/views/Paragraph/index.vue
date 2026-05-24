<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  Delete,
  EditPen,
  Plus,
  Rank,
  Search,
} from '@element-plus/icons-vue'
import { MdEditor, MdPreview } from 'md-editor-v3'
import { VueDraggable } from 'vue-draggable-plus'
import 'md-editor-v3/lib/style.css'
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
const error = ref('')
const searchText = ref('')
const searchType = ref<'title' | 'content'>('title')
const hoveredChunkId = ref<string | null>(null)
const dialogOpen = ref(false)
const dialogMode = ref<DialogMode>('view')
const chunkEditingId = ref<string | null>(null)
const afterChunkId = ref<string | null>(null)
const chunkSaving = ref(false)

const chunkForm = reactive<ChunkForm>({
  title: '',
  content: '',
  status: 'ACTIVE',
})

const visibleChunkCount = computed(
  () => chunks.value.filter((chunk) => matchesChunk(chunk)).length,
)

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
  error.value = ''

  try {
    const [documentResult, chunkList] = await Promise.all([
      getDocument(documentId.value),
      listDocumentChunks(documentId.value),
    ])
    documentDetail.value = documentResult
    chunks.value = chunkList
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载分段失败'
  } finally {
    loading.value = false
  }
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
  error.value = ''

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
    error.value = cause instanceof Error ? cause.message : '保存分段失败'
  } finally {
    chunkSaving.value = false
  }
}

const toggleChunk = async (chunk: KnowledgeChunk, isActive: boolean) => {
  error.value = ''

  try {
    const updated = await updateDocumentChunk(chunk.id, {
      status: isActive ? 'ACTIVE' : 'DISABLED',
    })
    replaceChunk(updated)
    await refreshDocument()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '更新分段状态失败'
  }
}

const removeChunk = async (chunk: KnowledgeChunk) => {
  error.value = ''

  try {
    await ElMessageBox.confirm(`删除分段「${chunk.title || `#${chunk.position + 1}`}」？`, '删除分段', {
      cancelButtonText: '取消',
      confirmButtonText: '删除',
      type: 'warning',
    })
    await deleteDocumentChunk(chunk.id)
    chunks.value = await listDocumentChunks(documentId.value)
    await refreshDocument()
  } catch (cause) {
    if (cause === 'cancel' || cause === 'close') {
      return
    }

    error.value = cause instanceof Error ? cause.message : '删除分段失败'
  }
}

const saveOrder = async () => {
  if (searchText.value.trim()) {
    return
  }

  ordering.value = true
  error.value = ''

  try {
    chunks.value = await reorderDocumentChunks(documentId.value, {
      chunkIds: chunks.value.map((chunk) => chunk.id),
    })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存分段顺序失败'
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

const chunkStatusClass = (status: ChunkStatus) => (status === 'ACTIVE' ? 'success' : 'info')

onMounted(load)
</script>

<template>
  <div class="grid gap-4">
    <header class="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
      <div class="flex min-w-0 items-start gap-3">
        <el-button
          :icon="ArrowLeft"
          circle
          @click="
            router.push({
              name: 'knowledge-documents',
              params: { knowledgeBaseId },
            })
          "
        />
        <div class="min-w-0">
          <p class="m-0 text-sm text-(--zeta-muted)">文档 / 分段</p>
          <h1 class="m-0 mt-1 truncate text-2xl font-semibold text-(--zeta-ink)">
            {{ documentDetail?.name || '分段' }}
          </h1>
          <div class="mt-2 flex flex-wrap gap-2">
            <el-tag effect="plain">{{ documentDetail?.chunkCount ?? chunks.length }} 个分段</el-tag>
            <el-tag effect="plain" type="info">
              {{ documentDetail?.charCount ?? 0 }} 字符
            </el-tag>
            <el-tag v-if="documentDetail" effect="plain" type="info">
              更新于 {{ formatTime(documentDetail.updatedAt) }}
            </el-tag>
          </div>
        </div>
      </div>
      <el-button :icon="Plus" :disabled="loading" type="primary" @click="openCreateChunk()">
        新增分段
      </el-button>
    </header>

    <el-alert v-if="error" :closable="false" :title="error" type="error" />

    <el-card
      v-loading="loading || ordering"
      :body-style="{ padding: '0' }"
      shadow="never"
      class="overflow-hidden"
    >
      <div
        class="flex flex-col justify-between gap-3 border-b border-(--zeta-line-soft) bg-(--zeta-surface) p-4 lg:flex-row lg:items-center"
      >
        <span class="text-sm text-(--zeta-muted)">
          {{ visibleChunkCount }} / {{ chunks.length }} 个分段
        </span>
        <el-input
          v-model="searchText"
          :prefix-icon="Search"
          clearable
          placeholder="搜索"
          class="w-full lg:w-72"
        >
          <template #prepend>
            <el-select v-model="searchType" class="w-24">
              <el-option label="标题" value="title" />
              <el-option label="内容" value="content" />
            </el-select>
          </template>
        </el-input>
      </div>

      <div class="grid min-h-[640px] grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside class="hidden border-r border-(--zeta-line-soft) bg-(--zeta-surface-tint) p-4 lg:block">
          <el-scrollbar height="600px">
            <div class="grid gap-1">
              <button
                v-for="chunk in chunks.filter((item) => item.title && matchesChunk(item))"
                :key="chunk.id"
                class="w-full truncate rounded-md border-0 bg-transparent px-3 py-2 text-left text-sm text-(--zeta-muted) hover:bg-(--zeta-blue-soft) hover:text-(--zeta-blue)"
                type="button"
                @click="scrollToChunk(chunk.id)"
              >
                {{ chunk.title }}
              </button>
            </div>
          </el-scrollbar>
        </aside>

        <main class="min-w-0 bg-(--zeta-bg) p-4">
          <el-empty v-if="chunks.length === 0" description="暂无分段" />
          <el-empty v-else-if="visibleChunkCount === 0" description="没有匹配的分段" />

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
              class="group relative mb-4 cursor-pointer rounded-lg border border-white bg-(--zeta-panel) p-4 shadow-none hover:border-(--zeta-line)"
              :class="chunk.status === 'DISABLED' ? 'opacity-60' : ''"
              @click="openViewChunk(chunk)"
              @mouseenter="hoveredChunkId = chunk.id"
              @mouseleave="hoveredChunkId = null"
            >
              <div
                v-if="hoveredChunkId === chunk.id"
                class="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-(--zeta-line) bg-(--zeta-panel) px-3 py-2 shadow-sm"
                @click.stop
              >
                <el-switch
                  :model-value="chunk.status === 'ACTIVE'"
                  size="small"
                  @change="(value: string | number | boolean) => toggleChunk(chunk, Boolean(value))"
                />
                <el-button :icon="EditPen" link @click="openEditChunk(chunk)" />
                <el-button :icon="Plus" link @click="openCreateChunk(chunk)" />
                <el-button :icon="Delete" link type="danger" @click="removeChunk(chunk)" />
              </div>

              <div class="mb-3 flex items-start gap-3">
                <el-icon
                  class="chunk-drag-handle mt-1 cursor-grab text-(--zeta-subtle)"
                  @click.stop
                >
                  <Rank />
                </el-icon>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="m-0 truncate text-lg font-semibold text-(--zeta-ink)">
                      {{ chunk.title || '-' }}
                    </h2>
                    <el-tag :type="chunkStatusClass(chunk.status)" effect="light" size="small">
                      {{ chunkStatusText(chunk.status) }}
                    </el-tag>
                  </div>
                  <p class="m-0 mt-1 text-sm text-(--zeta-muted)">
                    #{{ chunk.position + 1 }} · {{ chunk.charCount }} 字符
                  </p>
                </div>
              </div>

              <MdPreview
                :editor-id="`chunk-preview-${chunk.id}`"
                :model-value="chunk.content"
                class="zeta-md-preview"
              />
            </article>
          </VueDraggable>
        </main>
      </div>
    </el-card>

    <el-dialog
      v-model="dialogOpen"
      :title="dialogTitle"
      width="min(920px, calc(100vw - 32px))"
      destroy-on-close
    >
      <template v-if="dialogMode === 'view'">
        <div class="grid gap-4">
          <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 class="m-0 text-lg font-semibold">{{ chunkForm.title || '-' }}</h3>
              <p class="m-0 mt-1 text-sm text-(--zeta-muted)">
                {{ chunkForm.content.length }} 字符
              </p>
            </div>
            <el-button :icon="EditPen" type="primary" @click="dialogMode = 'edit'">
              编辑
            </el-button>
          </div>
          <MdPreview
            editor-id="chunk-dialog-preview"
            :model-value="chunkForm.content"
            class="zeta-md-preview rounded-lg border border-(--zeta-line-soft) p-3"
          />
        </div>
      </template>

      <el-form v-else label-position="top" @submit.prevent="saveChunk">
        <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
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
            <MdEditor v-model="chunkForm.content" :preview="false" style="height: 420px" />
          </el-form-item>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="dialogOpen = false">关闭</el-button>
        <el-button
          v-if="dialogMode !== 'view'"
          :loading="chunkSaving"
          type="primary"
          @click="saveChunk"
        >
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.zeta-md-preview {
  background: transparent;
}

.zeta-md-preview :deep(.md-editor-preview-wrapper) {
  padding: 0;
}

.zeta-md-preview :deep(.md-editor-preview) {
  color: var(--zeta-content);
  font-size: 14px;
  line-height: 1.8;
}
</style>
