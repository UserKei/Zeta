<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
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
import { Checkbox } from '@/components/ui/checkbox'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  createModel,
  deleteModel,
  listModelCatalogModels,
  listModelCatalogProviders,
  listModelCatalogTypes,
  listModels,
  updateModel,
  type AiModel,
  type AiModelType,
  type ModelCatalogModel,
  type ModelCatalogProvider,
  type ModelPayload,
  type ModelTypeOption,
} from '@/apis/models'
import { showErrorMessage } from '@/utils/feedback'

defineOptions({
  name: 'ModelsView',
})

const models = ref<AiModel[]>([])
const loading = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const formOpen = ref(false)
const deleteOpen = ref(false)
const deleting = ref(false)
const deletingModel = ref<AiModel | null>(null)
const configJsonText = ref('')
const catalogProviders = ref<ModelCatalogProvider[]>([])
const catalogTypes = ref<ModelTypeOption[]>([])
const catalogModels = ref<ModelCatalogModel[]>([])
const catalogLoading = ref(false)
const modelNameMode = ref<'recommended' | 'custom'>('recommended')
const baseUrlTouched = ref(false)

const fallbackModelTypes: { value: AiModelType; label: string }[] = [
  { value: 'CHAT', label: '对话模型' },
  { value: 'EMBEDDING', label: 'Embedding' },
  { value: 'RERANKER', label: 'Reranker' },
  { value: 'IMAGE', label: '视觉模型' },
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

const providerOptions = computed(() => {
  const options = [...catalogProviders.value]

  if (form.provider && !options.some((item) => item.value === form.provider)) {
    options.push({ value: form.provider, label: form.provider })
  }

  return options
})

const modelTypeOptions = computed(() => {
  const options = [...catalogTypes.value]

  if (form.type && !options.some((item) => item.value === form.type)) {
    options.push({
      value: form.type,
      label: fallbackModelTypes.find((item) => item.value === form.type)?.label ?? form.type,
    })
  }

  return options
})

const recommendedModelOptions = computed(() => {
  const options = [...catalogModels.value]

  if (
    form.modelName &&
    modelNameMode.value === 'recommended' &&
    !options.some((item) => item.value === form.modelName)
  ) {
    options.push({
      value: form.modelName,
      label: form.modelName,
      type: form.type,
    })
  }

  return options
})

const isAiModelType = (value: unknown): value is AiModelType =>
  fallbackModelTypes.some((item) => item.value === value)

const providerLabel = (provider: string) =>
  catalogProviders.value.find((item) => item.value === provider)?.label ?? provider

const modelTypeLabel = (type: AiModelType) =>
  catalogTypes.value.find((item) => item.value === type)?.label ??
  fallbackModelTypes.find((item) => item.value === type)?.label ??
  type

const safeConfigJson = () => {
  const content = configJsonText.value.trim()

  if (!content) {
    return {}
  }

  try {
    const parsed = JSON.parse(content) as unknown

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }

    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

const mergeConfigDefaults = (defaults?: Record<string, unknown>) => {
  if (!defaults || Object.keys(defaults).length === 0) {
    return
  }

  const currentConfig = safeConfigJson()

  if (!currentConfig) {
    return
  }

  configJsonText.value = JSON.stringify(
    {
      ...defaults,
      ...currentConfig,
    },
    null,
    2,
  )
}

const selectRecommendedModel = (modelName: string) => {
  form.modelName = modelName

  const catalogModel = catalogModels.value.find((item) => item.value === modelName)
  mergeConfigDefaults(catalogModel?.defaultConfigJson)
}

const loadCatalogModelsForCurrentType = async (selectFirstModel = false) => {
  if (!form.provider || !form.type) {
    catalogModels.value = []
    return
  }

  try {
    catalogModels.value = await listModelCatalogModels(form.provider, form.type)

    if (selectFirstModel) {
      const firstModel = catalogModels.value[0]

      if (firstModel) {
        modelNameMode.value = 'recommended'
        selectRecommendedModel(firstModel.value)
      } else {
        modelNameMode.value = 'custom'
        form.modelName = ''
      }
    }
  } catch {
    catalogModels.value = []
  }
}

const loadCatalogForCurrentProvider = async (selectFirstModel = false) => {
  if (!form.provider) {
    catalogTypes.value = []
    catalogModels.value = []
    return
  }

  catalogLoading.value = true

  try {
    catalogTypes.value = await listModelCatalogTypes(form.provider)

    if (!catalogTypes.value.some((item) => item.value === form.type)) {
      const nextType =
        catalogTypes.value.find((item) => item.value === 'CHAT') ?? catalogTypes.value[0]

      if (nextType) {
        form.type = nextType.value
      }
    }

    await loadCatalogModelsForCurrentType(selectFirstModel)
  } catch {
    catalogTypes.value = []
    catalogModels.value = []
  } finally {
    catalogLoading.value = false
  }
}

const ensureCatalogProviders = async () => {
  if (catalogProviders.value.length > 0) {
    return
  }

  catalogProviders.value = await listModelCatalogProviders()
}

const load = async () => {
  loading.value = true

  try {
    const [modelList, providerList] = await Promise.all([listModels(), listModelCatalogProviders()])

    models.value = modelList
    catalogProviders.value = providerList
  } catch (cause) {
    showErrorMessage(cause, '加载模型失败')
  } finally {
    loading.value = false
  }
}

const openCreate = async () => {
  editingId.value = null
  baseUrlTouched.value = false
  modelNameMode.value = 'recommended'
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

  try {
    await ensureCatalogProviders()
    const provider =
      catalogProviders.value.find((item) => item.value === 'aliyun-bailian') ??
      catalogProviders.value[0]

    if (provider) {
      form.provider = provider.value
      form.baseUrl = provider.defaultBaseUrl ?? ''
      mergeConfigDefaults(provider.defaultConfigJson)
      await loadCatalogForCurrentProvider(true)
    }
  } catch (cause) {
    showErrorMessage(cause, '加载模型目录失败')
  }
}

const openEdit = async (model: AiModel) => {
  editingId.value = model.id
  baseUrlTouched.value = false
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
    Object.keys(model.configJson).length > 0 ? JSON.stringify(model.configJson, null, 2) : ''
  formOpen.value = true

  try {
    await ensureCatalogProviders()
    await loadCatalogForCurrentProvider(false)
    modelNameMode.value = catalogModels.value.some((item) => item.value === form.modelName)
      ? 'recommended'
      : 'custom'
  } catch (cause) {
    modelNameMode.value = 'custom'
    showErrorMessage(cause, '加载模型目录失败')
  }
}

const handleProviderChange = async (value: unknown) => {
  if (typeof value !== 'string' || !value) {
    return
  }

  form.provider = value
  modelNameMode.value = 'recommended'

  const provider = catalogProviders.value.find((item) => item.value === value)

  if (!baseUrlTouched.value) {
    form.baseUrl = provider?.defaultBaseUrl ?? ''
  }

  mergeConfigDefaults(provider?.defaultConfigJson)
  await loadCatalogForCurrentProvider(true)
}

const handleTypeChange = async (value: unknown) => {
  if (!isAiModelType(value)) {
    return
  }

  form.type = value
  modelNameMode.value = 'recommended'
  await loadCatalogModelsForCurrentType(true)
}

const handleModelNameModeChange = (value: unknown) => {
  if (value !== 'recommended' && value !== 'custom') {
    return
  }

  modelNameMode.value = value

  if (value === 'recommended') {
    const selected = catalogModels.value.find((item) => item.value === form.modelName)
    selectRecommendedModel(selected?.value ?? catalogModels.value[0]?.value ?? '')
  }
}

const handleRecommendedModelChange = (value: unknown) => {
  if (typeof value !== 'string' || !value) {
    return
  }

  selectRecommendedModel(value)
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
  deletingModel.value = model
  deleteOpen.value = true
}

const confirmRemove = async () => {
  if (!deletingModel.value) {
    return
  }

  deleting.value = true

  try {
    await deleteModel(deletingModel.value.id)
    models.value = models.value.filter((item) => item.id !== deletingModel.value?.id)
    deleteOpen.value = false
    deletingModel.value = null
  } catch (cause) {
    showErrorMessage(cause, '删除模型失败')
  } finally {
    deleting.value = false
  }
}

onMounted(load)
</script>

<template>
  <Card class="m-4 gap-4 overflow-hidden p-4 lg:m-6 lg:p-6">
    <CardHeader
      class="flex flex-col items-start justify-between gap-4 px-0 pt-0 lg:flex-row lg:items-center"
    >
      <CardTitle class="text-[34px] font-bold text-foreground">模型管理</CardTitle>
      <Button @click="openCreate">添加模型</Button>
    </CardHeader>

    <CardContent class="min-w-0 overflow-hidden rounded-lg border border-border p-0">
      <Table>
        <TableHeader>
          <TableRow class="bg-muted/60 hover:bg-muted/60">
            <TableHead class="min-w-55">名称</TableHead>
            <TableHead class="min-w-36">供应商</TableHead>
            <TableHead class="min-w-34">类型</TableHead>
            <TableHead class="min-w-45">模型标识</TableHead>
            <TableHead class="min-w-36">凭证</TableHead>
            <TableHead class="min-w-24">状态</TableHead>
            <TableHead class="min-w-36 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="loading">
            <TableCell colspan="7" class="h-24 text-center text-muted-foreground">
              正在加载模型配置...
            </TableCell>
          </TableRow>
          <TableRow v-else-if="models.length === 0">
            <TableCell colspan="7" class="h-24 text-center text-muted-foreground">
              还没有模型配置
            </TableCell>
          </TableRow>
          <template v-else>
            <TableRow v-for="model in models" :key="model.id">
              <TableCell>
                <div class="grid gap-1">
                  <strong class="font-semibold text-foreground">{{ model.name }}</strong>
                  <small class="text-muted-foreground">{{
                    model.baseUrl || '默认 Base URL'
                  }}</small>
                </div>
              </TableCell>
              <TableCell class="text-muted-foreground">{{
                providerLabel(model.provider)
              }}</TableCell>
              <TableCell>
                <Badge variant="outline">
                  {{ modelTypeLabel(model.type) }}
                </Badge>
              </TableCell>
              <TableCell class="font-medium text-foreground">{{ model.modelName }}</TableCell>
              <TableCell class="text-muted-foreground">{{
                model.apiKeyMasked || '未配置'
              }}</TableCell>
              <TableCell>
                <Badge :variant="model.isEnabled ? 'default' : 'secondary'">
                  {{ model.isEnabled ? '启用' : '停用' }}
                </Badge>
              </TableCell>
              <TableCell>
                <div class="flex justify-end gap-2">
                  <Button variant="outline" size="sm" @click="openEdit(model)">编辑</Button>
                  <Button variant="destructive" size="sm" @click="remove(model)">删除</Button>
                </div>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
    </CardContent>

    <Dialog v-model:open="formOpen">
      <DialogContent class="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ title }}</DialogTitle>
          <DialogDescription> 配置模型供应商、模型标识和调用凭证。 </DialogDescription>
        </DialogHeader>

        <form class="grid grid-cols-1 gap-4 md:grid-cols-2" @submit.prevent="save">
          <div class="grid gap-2">
            <Label for="model-name">配置名称</Label>
            <Input id="model-name" v-model="form.name" />
          </div>

          <div class="grid gap-2">
            <Label for="model-provider">供应商</Label>
            <Select :model-value="form.provider" @update:model-value="handleProviderChange">
              <SelectTrigger id="model-provider" class="w-full">
                <SelectValue placeholder="选择供应商" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem
                    v-for="provider in providerOptions"
                    :key="provider.value"
                    :value="provider.value"
                  >
                    {{ provider.label }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div class="grid gap-2">
            <Label for="model-type">模型类型</Label>
            <Select :model-value="form.type" @update:model-value="handleTypeChange">
              <SelectTrigger id="model-type" class="w-full">
                <SelectValue placeholder="选择模型类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem
                    v-for="type in modelTypeOptions"
                    :key="type.value"
                    :value="type.value"
                  >
                    {{ type.label }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div class="grid gap-2">
            <div class="flex items-center justify-between gap-3">
              <Label for="model-id">模型标识</Label>
              <ToggleGroup
                :model-value="modelNameMode"
                type="single"
                variant="outline"
                size="sm"
                @update:model-value="handleModelNameModeChange"
              >
                <ToggleGroupItem value="recommended">推荐</ToggleGroupItem>
                <ToggleGroupItem value="custom">自定义</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <Select
              v-if="modelNameMode === 'recommended'"
              :model-value="form.modelName"
              :disabled="catalogLoading || recommendedModelOptions.length === 0"
              @update:model-value="handleRecommendedModelChange"
            >
              <SelectTrigger id="model-id" class="w-full">
                <SelectValue
                  :placeholder="
                    recommendedModelOptions.length > 0 ? '选择推荐模型' : '暂无推荐模型'
                  "
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem
                    v-for="model in recommendedModelOptions"
                    :key="model.value"
                    :value="model.value"
                  >
                    {{ model.label }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Input v-else id="model-id" v-model="form.modelName" placeholder="自定义模型标识" />
          </div>

          <div class="grid gap-2 md:col-span-2">
            <Label for="model-base-url">Base URL</Label>
            <Input
              id="model-base-url"
              v-model="form.baseUrl"
              placeholder="https://api.example.com/v1"
              @update:model-value="baseUrlTouched = true"
            />
          </div>

          <div class="grid gap-2 md:col-span-2">
            <Label for="model-api-key">API Key</Label>
            <Input
              id="model-api-key"
              v-model="form.apiKey"
              autocomplete="off"
              :placeholder="editingId ? '留空表示保持原凭证' : '可留空'"
              type="password"
            />
          </div>

          <div class="grid gap-2 md:col-span-2">
            <Label for="model-config-json">高级配置 JSON</Label>
            <Textarea
              id="model-config-json"
              v-model="configJsonText"
              class="min-h-32"
              placeholder='例如：{"protocol":"dashscope-multimodal","dimension":1024}'
            />
          </div>

          <div class="flex items-center gap-2 md:col-span-2">
            <Checkbox id="model-enabled" v-model:checked="form.isEnabled" />
            <Label for="model-enabled">启用这个模型配置</Label>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" @click="formOpen = false">取消</Button>
          <Button :disabled="saving" @click="save">
            {{ saving ? '保存中...' : '保存' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog v-model:open="deleteOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除模型</AlertDialogTitle>
          <AlertDialogDescription>
            删除模型「{{ deletingModel?.name }}」？相关知识库或 Agent 会保留为未配置模型状态。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="deleting">取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            :disabled="deleting"
            @click.prevent="confirmRemove"
          >
            {{ deleting ? '删除中...' : '删除' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </Card>
</template>
