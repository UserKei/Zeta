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
import { isCancelAction, showErrorMessage } from '@/utils/feedback'

defineOptions({
  name: 'ModelsView',
})

const models = ref<AiModel[]>([])
const loading = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const formOpen = ref(false)
const configJsonText = ref('')

const modelTypes: { value: AiModelType; label: string }[] = [
  { value: 'CHAT', label: '对话模型' },
  { value: 'EMBEDDING', label: 'Embedding' },
  { value: 'RERANKER', label: 'Reranker' },
]

const form = reactive<ModelPayload>({
  name: '',
  provider: '',
  type: 'CHAT',
  modelName: '',
  baseUrl: '',
  apiKey: '',
  isEnabled: true,
  configJson: {},
})

const title = computed(() => (editingId.value ? '编辑模型' : '添加模型'))

const load = async () => {
  loading.value = true

  try {
    models.value = await listModels()
  } catch (cause) {
    showErrorMessage(cause, '加载模型失败')
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
    configJson: {},
  })
  configJsonText.value = ''
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
    configJson: model.configJson,
  })
  configJsonText.value =
    Object.keys(model.configJson).length > 0
      ? JSON.stringify(model.configJson, null, 2)
      : ''
  formOpen.value = true
}

const save = async () => {
  saving.value = true

  try {
    const configJson = parseConfigJson()
    const payload = {
      ...form,
      apiKey: form.apiKey || undefined,
      baseUrl: form.baseUrl || undefined,
      configJson,
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
    showErrorMessage(cause, '保存模型失败')
  } finally {
    saving.value = false
  }
}

const parseConfigJson = () => {
  const content = configJsonText.value.trim()

  if (!content) {
    return {}
  }

  try {
    const parsed = JSON.parse(content) as unknown

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('高级配置必须是 JSON 对象')
    }

    return parsed as Record<string, unknown>
  } catch (cause) {
    throw cause instanceof Error ? cause : new Error('高级配置 JSON 格式不正确')
  }
}

const remove = async (model: AiModel) => {
  try {
    await ElMessageBox.confirm(`删除模型「${model.name}」？`, '删除模型', {
      cancelButtonText: '取消',
      confirmButtonText: '删除',
      type: 'warning',
    })
    await deleteModel(model.id)
    models.value = models.value.filter((item) => item.id !== model.id)
  } catch (cause) {
    if (isCancelAction(cause)) {
      return
    }

    showErrorMessage(cause, '删除模型失败')
  }
}

onMounted(load)
</script>

<template>
  <div class="grid gap-5">
    <header class="flex flex-col items-start justify-between gap-4.5 lg:flex-row lg:items-end">
      <div>
        <h1 class="m-0 text-[34px] font-bold">模型管理</h1>
      </div>
      <el-button type="primary" @click="openCreate">添加模型</el-button>
    </header>

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
          <el-form-item class="md:col-span-2" label="高级配置 JSON">
            <el-input
              v-model="configJsonText"
              :rows="5"
              placeholder='例如：{"protocol":"dashscope-multimodal","dimension":1024}'
              type="textarea"
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
