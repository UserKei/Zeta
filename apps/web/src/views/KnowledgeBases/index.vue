<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  listKnowledgeBases,
  updateKnowledgeBase,
  type KnowledgeBase,
  type KnowledgeBasePayload,
  type KnowledgeBaseStatus,
} from '@/apis/knowledge-bases'
import { listModels, type AiModel } from '@/apis/models'
import { isCancelAction, showErrorMessage } from '@/utils/feedback'

defineOptions({
  name: 'KnowledgeBasesView',
})

const router = useRouter()
const knowledgeBases = ref<KnowledgeBase[]>([])
const models = ref<AiModel[]>([])
const loading = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const formOpen = ref(false)
const keyword = ref('')
const statusFilter = ref<KnowledgeBaseStatus | ''>('')

const form = reactive<KnowledgeBasePayload>({
  name: '',
  description: '',
  status: 'ACTIVE',
  embeddingModelId: '',
  chunkSize: 800,
  chunkOverlap: 100,
})

const embeddingModels = computed(() =>
  models.value.filter((model) => model.type === 'EMBEDDING' && model.isEnabled),
)

const title = computed(() => (editingId.value ? '编辑知识库' : '创建知识库'))

const filteredKnowledgeBases = computed(() => {
  const query = keyword.value.trim().toLowerCase()

  return knowledgeBases.value.filter((knowledgeBase) => {
    const matchedStatus =
      statusFilter.value === '' || knowledgeBase.status === statusFilter.value
    const searchableText = [
      knowledgeBase.name,
      knowledgeBase.description ?? '',
      knowledgeBase.embeddingModel.name,
      knowledgeBase.embeddingModel.provider,
      knowledgeBase.embeddingModel.modelName,
    ]
      .join(' ')
      .toLowerCase()

    return matchedStatus && (!query || searchableText.includes(query))
  })
})

const activeCount = computed(
  () => knowledgeBases.value.filter((item) => item.status === 'ACTIVE').length,
)

const load = async () => {
  loading.value = true

  try {
    const [knowledgeBaseList, modelList] = await Promise.all([
      listKnowledgeBases(),
      listModels(),
    ])
    knowledgeBases.value = knowledgeBaseList
    models.value = modelList
  } catch (cause) {
    showErrorMessage(cause, '加载知识库失败')
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  editingId.value = null
  Object.assign(form, {
    name: '',
    description: '',
    status: 'ACTIVE' as KnowledgeBaseStatus,
    embeddingModelId: embeddingModels.value[0]?.id ?? '',
    chunkSize: 800,
    chunkOverlap: 100,
  })
  formOpen.value = true
}

const openEdit = (knowledgeBase: KnowledgeBase) => {
  editingId.value = knowledgeBase.id
  Object.assign(form, {
    name: knowledgeBase.name,
    description: knowledgeBase.description ?? '',
    status: knowledgeBase.status,
    embeddingModelId: knowledgeBase.embeddingModelId,
    chunkSize: knowledgeBase.chunkSize,
    chunkOverlap: knowledgeBase.chunkOverlap,
  })
  formOpen.value = true
}

const save = async () => {
  saving.value = true

  try {
    const payload = {
      ...form,
      description: form.description || undefined,
    }
    const saved = editingId.value
      ? await updateKnowledgeBase(editingId.value, payload)
      : await createKnowledgeBase(payload)
    const index = knowledgeBases.value.findIndex((item) => item.id === saved.id)

    if (index >= 0) {
      knowledgeBases.value[index] = saved
    } else {
      knowledgeBases.value.unshift(saved)
    }

    formOpen.value = false
  } catch (cause) {
    showErrorMessage(cause, '保存知识库失败')
  } finally {
    saving.value = false
  }
}

const remove = async (knowledgeBase: KnowledgeBase) => {
  try {
    await ElMessageBox.confirm(`删除知识库「${knowledgeBase.name}」？`, '删除知识库', {
      cancelButtonText: '取消',
      confirmButtonText: '删除',
      type: 'warning',
    })
    await deleteKnowledgeBase(knowledgeBase.id)
    knowledgeBases.value = knowledgeBases.value.filter((item) => item.id !== knowledgeBase.id)
  } catch (cause) {
    if (isCancelAction(cause)) {
      return
    }

    showErrorMessage(cause, '删除知识库失败')
  }
}

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const statusText = (status: KnowledgeBaseStatus) =>
  status === 'ACTIVE' ? '启用' : '停用'

onMounted(load)
</script>

<template>
  <div class="grid gap-4">
    <header class="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-end">
      <div>
        <h1 class="m-0 text-2xl font-semibold text-(--zeta-ink)">知识库</h1>
        <p class="mt-1.5 text-sm text-(--zeta-muted)">
          共 {{ knowledgeBases.length }} 个知识库，{{ activeCount }} 个启用
        </p>
      </div>
      <el-button :icon="Plus" type="primary" @click="openCreate">创建知识库</el-button>
    </header>

    <section v-if="embeddingModels.length === 0"
      class="rounded-lg border border-(--zeta-warning-line) bg-(--zeta-warning-soft) px-4 py-3.5 text-(--zeta-warning)">
      还没有可用的 Embedding 模型。请先在模型管理里添加并启用一个 Embedding 模型。
    </section>

    <section class="min-w-0 overflow-hidden rounded-lg border border-(--zeta-line) bg-(--zeta-panel)">
      <div
        class="flex flex-col justify-between gap-3 border-b border-(--zeta-line-soft) bg-(--zeta-surface) px-4 py-3 lg:flex-row lg:items-center"
      >
        <div class="flex flex-wrap items-center gap-2">
          <el-button :icon="Plus" type="primary" @click="openCreate">创建</el-button>
          <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
          <span class="text-sm text-(--zeta-muted)">
            当前 {{ filteredKnowledgeBases.length }} / {{ knowledgeBases.length }}
          </span>
        </div>
        <div class="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <el-select
            v-model="statusFilter"
            clearable
            placeholder="状态"
            class="w-full sm:w-32"
          >
            <el-option label="启用" value="ACTIVE" />
            <el-option label="停用" value="DISABLED" />
          </el-select>
          <el-input
            v-model="keyword"
            :prefix-icon="Search"
            clearable
            placeholder="搜索知识库"
            class="w-full sm:w-64"
          />
        </div>
      </div>

      <el-table v-loading="loading" :data="filteredKnowledgeBases" empty-text="还没有知识库">
        <el-table-column label="名称" min-width="220">
          <template #default="{ row }: { row: KnowledgeBase }">
            <div class="grid gap-1">
              <el-link
                type="primary"
                @click="
                  router.push({
                    name: 'knowledge-documents',
                    params: { knowledgeBaseId: row.id },
                  })
                "
              >
                {{ row.name }}
              </el-link>
              <small class="text-(--zeta-muted)">{{ row.description || '暂无描述' }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Embedding 模型" min-width="240">
          <template #default="{ row }: { row: KnowledgeBase }">
            <div class="grid gap-1">
              <strong>{{ row.embeddingModel.name }}</strong>
              <small class="text-(--zeta-muted)">
                {{ row.embeddingModel.provider }} /
                {{ row.embeddingModel.modelName }}
              </small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="分块配置" min-width="130">
          <template #default="{ row }: { row: KnowledgeBase }">
            <div class="grid gap-1">
              <strong>{{ row.chunkSize }}</strong>
              <small class="text-(--zeta-muted)">重叠长度 {{ row.chunkOverlap }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="100">
          <template #default="{ row }: { row: KnowledgeBase }">
            <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" effect="light">
              {{ statusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="150">
          <template #default="{ row }: { row: KnowledgeBase }">
            {{ formatTime(row.updatedAt) }}
          </template>
        </el-table-column>
        <el-table-column align="right" fixed="right" label="操作" min-width="210">
          <template #default="{ row }: { row: KnowledgeBase }">
            <el-button
              size="small"
              @click="
                router.push({
                  name: 'knowledge-documents',
                  params: { knowledgeBaseId: row.id },
                })
              "
            >
              进入
            </el-button>
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="formOpen" :title="title" width="720px">
      <el-alert
        v-if="embeddingModels.length === 0"
        :closable="false"
        class="mb-4"
        title="创建知识库前需要先配置一个启用状态的 Embedding 模型。"
        type="warning"
      />

      <el-form label-position="top" @submit.prevent="save">
        <div class="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <el-form-item label="知识库名称">
            <el-input v-model="form.name" />
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="form.status">
              <el-option label="启用" value="ACTIVE" />
              <el-option label="停用" value="DISABLED" />
            </el-select>
          </el-form-item>
          <el-form-item class="md:col-span-2" label="描述">
            <el-input v-model="form.description" placeholder="例如：人事制度、采购流程、IT 支持" />
          </el-form-item>
          <el-form-item class="md:col-span-2" label="Embedding 模型">
            <el-select
              v-model="form.embeddingModelId"
              :disabled="embeddingModels.length === 0"
              placeholder="请选择 Embedding 模型"
            >
              <el-option
                v-for="model in embeddingModels"
                :key="model.id"
                :label="`${model.name} - ${model.provider} / ${model.modelName}`"
                :value="model.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="分块大小">
            <el-input-number v-model="form.chunkSize" :min="1" controls-position="right" />
          </el-form-item>
          <el-form-item label="重叠长度">
            <el-input-number v-model="form.chunkOverlap" :min="0" controls-position="right" />
          </el-form-item>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="formOpen = false">取消</el-button>
        <el-button :disabled="embeddingModels.length === 0" :loading="saving" type="primary" @click="save">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>
