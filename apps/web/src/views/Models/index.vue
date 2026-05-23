<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import {
  createModel,
  deleteModel,
  listModels,
  updateModel,
  type AiModel,
  type AiModelType,
  type ModelPayload,
} from '@/apis/models'

defineOptions({
  name: 'ModelsView',
})

const models = ref<AiModel[]>([])
const error = ref('')
const loading = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const formOpen = ref(false)

const modelTypes: { value: AiModelType; label: string; hint: string }[] = [
  { value: 'CHAT', label: '对话模型', hint: 'Agent 生成回答' },
  { value: 'EMBEDDING', label: 'Embedding', hint: '文档与问题向量化' },
  { value: 'RERANKER', label: 'Reranker', hint: '召回结果重排' },
]

const form = reactive<ModelPayload>({
  name: '',
  provider: '',
  type: 'CHAT',
  modelName: '',
  baseUrl: '',
  apiKey: '',
  isEnabled: true,
})

const title = computed(() => (editingId.value ? '编辑模型' : '添加模型'))

const load = async () => {
  loading.value = true
  error.value = ''

  try {
    models.value = await listModels()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载模型失败'
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  editingId.value = null
  Object.assign(form, {
    name: '',
    provider: '',
    type: 'CHAT',
    modelName: '',
    baseUrl: '',
    apiKey: '',
    isEnabled: true,
  })
  formOpen.value = true
}

const openEdit = (model: AiModel) => {
  editingId.value = model.id
  Object.assign(form, {
    name: model.name,
    provider: model.provider,
    type: model.type,
    modelName: model.modelName,
    baseUrl: model.baseUrl ?? '',
    apiKey: '',
    isEnabled: model.isEnabled,
  })
  formOpen.value = true
}

const save = async () => {
  saving.value = true
  error.value = ''

  try {
    const payload = {
      ...form,
      apiKey: form.apiKey || undefined,
      baseUrl: form.baseUrl || undefined,
    }

    const saved = editingId.value
      ? await updateModel(editingId.value, payload)
      : await createModel(payload)

    const index = models.value.findIndex((model) => model.id === saved.id)

    if (index >= 0) {
      models.value[index] = saved
    } else {
      models.value.unshift(saved)
    }

    formOpen.value = false
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存模型失败'
  } finally {
    saving.value = false
  }
}

const remove = async (model: AiModel) => {
  error.value = ''

  try {
    await ElMessageBox.confirm(`删除模型「${model.name}」？`, '删除模型', {
      cancelButtonText: '取消',
      confirmButtonText: '删除',
      type: 'warning',
    })
    await deleteModel(model.id)
    models.value = models.value.filter((item) => item.id !== model.id)
  } catch (cause) {
    if (cause === 'cancel' || cause === 'close') {
      return
    }

    error.value = cause instanceof Error ? cause.message : '删除模型失败'
  }
}

onMounted(load)
</script>

<template>
  <div class="grid gap-5">
    <header class="flex flex-col items-start justify-between gap-4.5 lg:flex-row lg:items-end">
      <div>
        <p class="mb-2.5 font-bold text-(--zeta-blue)">MVP 第一阶段</p>
        <h1 class="m-0 text-[34px] font-bold">模型管理</h1>
        <p class="mt-2.5 text-(--zeta-muted)">先把对话、向量化和重排能力接进平台。</p>
      </div>
      <el-button type="primary" @click="openCreate">添加模型</el-button>
    </header>

    <el-alert v-if="error" :closable="false" :title="error" type="error" />

    <section class="grid grid-cols-1 gap-3.5 lg:grid-cols-3" aria-label="模型用途">
      <article
        v-for="type in modelTypes"
        :key="type.value"
        class="grid gap-2 rounded-lg border border-(--zeta-line) bg-(--zeta-panel) p-4.5"
      >
        <strong>{{ type.label }}</strong>
        <span class="text-(--zeta-muted)">{{ type.hint }}</span>
      </article>
    </section>

    <section
      class="min-w-0 rounded-lg border border-(--zeta-line) bg-(--zeta-panel)"
    >
      <el-table v-loading="loading" :data="models" empty-text="还没有模型配置">
        <el-table-column label="名称" min-width="220">
          <template #default="{ row }: { row: AiModel }">
            <div class="grid gap-1">
              <strong>{{ row.name }}</strong>
              <small class="text-(--zeta-muted)">{{ row.baseUrl || '默认 Base URL' }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="供应商" min-width="140" prop="provider" />
        <el-table-column label="类型" min-width="140">
          <template #default="{ row }: { row: AiModel }">
            {{ modelTypes.find((item) => item.value === row.type)?.label }}
          </template>
        </el-table-column>
        <el-table-column label="模型标识" min-width="180" prop="modelName" />
        <el-table-column label="凭证" min-width="150">
          <template #default="{ row }: { row: AiModel }">
            {{ row.apiKeyMasked || '未配置' }}
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="100">
          <template #default="{ row }: { row: AiModel }">
            <el-tag :type="row.isEnabled ? 'success' : 'info'" effect="light">
              {{ row.isEnabled ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column align="right" fixed="right" label="操作" min-width="150">
          <template #default="{ row }: { row: AiModel }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="formOpen" :title="title" width="680px">
      <el-form label-position="top" @submit.prevent="save">
        <div class="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <el-form-item label="配置名称">
            <el-input v-model="form.name" />
          </el-form-item>
          <el-form-item label="供应商">
            <el-input v-model="form.provider" placeholder="OpenAI / DeepSeek" />
          </el-form-item>
          <el-form-item label="模型类型">
            <el-select v-model="form.type">
              <el-option
                v-for="type in modelTypes"
                :key="type.value"
                :label="type.label"
                :value="type.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="模型标识">
            <el-input v-model="form.modelName" placeholder="gpt-4.1-mini" />
          </el-form-item>
          <el-form-item class="md:col-span-2" label="Base URL">
            <el-input v-model="form.baseUrl" placeholder="https://api.example.com/v1" />
          </el-form-item>
          <el-form-item class="md:col-span-2" label="API Key">
            <el-input
              v-model="form.apiKey"
              autocomplete="off"
              :placeholder="editingId ? '留空表示保持原凭证' : '可留空'"
              show-password
              type="password"
            />
          </el-form-item>
          <el-form-item class="md:col-span-2">
            <el-checkbox v-model="form.isEnabled">启用这个模型配置</el-checkbox>
          </el-form-item>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="formOpen = false">取消</el-button>
        <el-button :loading="saving" type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
