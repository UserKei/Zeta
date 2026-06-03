<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import aliyunBailianIconUrl from '@/assets/model-providers/aliyun-bailian.svg?url'
import deepSeekIconUrl from '@/assets/model-providers/deepseek.svg?url'
import openAiCompatibleIconUrl from '@/assets/model-providers/openai-compatible.svg?url'
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
const providerPickerOpen = ref(false)
const providerPickerShouldReturnToForm = ref(false)
const deleteOpen = ref(false)
const deleting = ref(false)
const deletingModel = ref<AiModel | null>(null)
const configJsonText = ref('')
const catalogProviders = ref<ModelCatalogProvider[]>([])
const catalogTypes = ref<ModelTypeOption[]>([])
const catalogModels = ref<ModelCatalogModel[]>([])
const catalogLoading = ref(false)
const catalogError = ref<string | null>(null)
const modelNameMode = ref<'recommended' | 'custom'>('recommended')
const baseUrlTouched = ref(false)
let catalogRequestId = 0

const CATALOG_ERROR_MESSAGE = '模型目录加载失败，请稍后重试'

const fallbackModelTypes: { value: AiModelType; label: string }[] = [
  { value: 'CHAT', label: '大语言模型' },
  { value: 'EMBEDDING', label: '向量模型' },
  { value: 'RERANKER', label: '重排模型' },
  { value: 'IMAGE', label: '视觉模型' },
]

const providerIconUrls: Record<string, string> = {
  'aliyun-bailian': aliyunBailianIconUrl,
  deepseek: deepSeekIconUrl,
  'openai-compatible': openAiCompatibleIconUrl,
}

const canonicalModelTypeLabel = (type: AiModelType) =>
  fallbackModelTypes.find((item) => item.value === type)?.label ?? type

const normalizeModelTypeOption = (option: ModelTypeOption): ModelTypeOption => ({
  ...option,
  label: canonicalModelTypeLabel(option.value),
})

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

const providerOptions = computed(() => catalogProviders.value)

const selectedProviderOption = computed(
  () => providerOptions.value.find((item) => item.value === form.provider) ?? null,
)

const modelTypeOptions = computed(() => {
  const options = catalogTypes.value.map(normalizeModelTypeOption)

  if (form.type && !options.some((item) => item.value === form.type)) {
    options.push({
      value: form.type,
      label: canonicalModelTypeLabel(form.type),
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

const providerIconUrl = (provider?: ModelCatalogProvider | null) =>
  provider?.icon ? providerIconUrls[provider.icon] : undefined

const providerSupportedTypeLabels = (provider?: ModelCatalogProvider | null) =>
  provider?.supportedTypes.map(canonicalModelTypeLabel) ?? []

const modelTypeLabel = (type: AiModelType) => canonicalModelTypeLabel(type)

const resolveDefaultBaseUrl = (model?: ModelCatalogModel) =>
  model?.defaultBaseUrl ??
  catalogProviders.value.find((item) => item.value === form.provider)?.defaultBaseUrl ??
  ''

const nextCatalogRequestId = () => {
  catalogRequestId += 1
  return catalogRequestId
}

const isCurrentCatalogRequest = (requestId: number, provider: string, type?: AiModelType) =>
  requestId === catalogRequestId &&
  provider === form.provider &&
  (type === undefined || type === form.type)

const setCatalogError = () => {
  catalogError.value = CATALOG_ERROR_MESSAGE
}

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

  if (!baseUrlTouched.value) {
    form.baseUrl = resolveDefaultBaseUrl(catalogModel)
  }

  mergeConfigDefaults(catalogModel?.defaultConfigJson)
}

const applyCatalogModels = async (
  provider: string,
  type: AiModelType,
  selectFirstModel: boolean,
  requestId: number,
) => {
  const models = await listModelCatalogModels(provider, type)

  if (!isCurrentCatalogRequest(requestId, provider, type)) {
    return false
  }

  catalogModels.value = models
  catalogError.value = null

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

  return true
}

const loadCatalogModelsForCurrentType = async (selectFirstModel = false) => {
  if (!form.provider || !form.type) {
    nextCatalogRequestId()
    catalogModels.value = []
    catalogError.value = null
    return false
  }

  const requestId = nextCatalogRequestId()
  const provider = form.provider
  const type = form.type
  catalogLoading.value = true
  catalogError.value = null

  try {
    return await applyCatalogModels(provider, type, selectFirstModel, requestId)
  } catch {
    if (isCurrentCatalogRequest(requestId, provider, type)) {
      catalogModels.value = []
      setCatalogError()
    }

    return false
  } finally {
    if (requestId === catalogRequestId) {
      catalogLoading.value = false
    }
  }
}

const loadCatalogProviders = async () => {
  catalogLoading.value = true
  catalogError.value = null

  try {
    catalogProviders.value = await listModelCatalogProviders()
    catalogError.value = null
    return true
  } catch {
    catalogProviders.value = []
    setCatalogError()
    return false
  } finally {
    catalogLoading.value = false
  }
}

const loadCatalogForCurrentProvider = async (selectFirstModel = false) => {
  if (!form.provider) {
    nextCatalogRequestId()
    catalogTypes.value = []
    catalogModels.value = []
    catalogError.value = null
    return false
  }

  if (!catalogProviders.value.some((item) => item.value === form.provider)) {
    nextCatalogRequestId()
    catalogTypes.value = []
    catalogModels.value = []
    modelNameMode.value = 'custom'
    catalogError.value = null
    return false
  }

  const requestId = nextCatalogRequestId()
  const provider = form.provider
  catalogLoading.value = true
  catalogError.value = null

  try {
    const types = await listModelCatalogTypes(provider)

    if (!isCurrentCatalogRequest(requestId, provider)) {
      return false
    }

    catalogTypes.value = types.map(normalizeModelTypeOption)

    if (!catalogTypes.value.some((item) => item.value === form.type)) {
      const nextType =
        catalogTypes.value.find((item) => item.value === 'CHAT') ?? catalogTypes.value[0]

      if (nextType) {
        form.type = nextType.value
      }
    }

    const type = form.type
    return await applyCatalogModels(provider, type, selectFirstModel, requestId)
  } catch {
    if (isCurrentCatalogRequest(requestId, provider)) {
      catalogTypes.value = []
      catalogModels.value = []
      setCatalogError()
    }

    return false
  } finally {
    if (requestId === catalogRequestId) {
      catalogLoading.value = false
    }
  }
}

const ensureCatalogProviders = async () => {
  if (catalogProviders.value.length > 0) {
    return true
  }

  return await loadCatalogProviders()
}

const retryCatalogProviders = () => {
  void loadCatalogProviders()
}

const retryCurrentCatalog = () => {
  if (!form.provider) {
    void loadCatalogProviders()
    return
  }

  void (async () => {
    if (catalogProviders.value.length === 0) {
      const loaded = await loadCatalogProviders()

      if (!loaded) {
        return
      }
    }

    await loadCatalogForCurrentProvider(modelNameMode.value === 'recommended' && !form.modelName)
  })()
}

const resetForm = () => {
  nextCatalogRequestId()
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
  catalogTypes.value = []
  catalogModels.value = []
  catalogError.value = null
}

const load = async () => {
  loading.value = true

  try {
    models.value = await listModels()
  } catch (cause) {
    showErrorMessage(cause, '加载模型失败')
  } finally {
    loading.value = false
  }

  await loadCatalogProviders()
}

const openCreate = async () => {
  editingId.value = null
  baseUrlTouched.value = false
  modelNameMode.value = 'recommended'
  resetForm()

  providerPickerShouldReturnToForm.value = false
  await ensureCatalogProviders()
  providerPickerOpen.value = true
}

const openProviderPickerFromForm = async () => {
  providerPickerShouldReturnToForm.value = true
  formOpen.value = false
  await ensureCatalogProviders()
  providerPickerOpen.value = true
}

const handleProviderPickerOpenChange = (open: boolean) => {
  providerPickerOpen.value = open

  if (!open && providerPickerShouldReturnToForm.value) {
    providerPickerShouldReturnToForm.value = false

    if (form.provider) {
      formOpen.value = true
    }
  }
}

const chooseProvider = async (provider: ModelCatalogProvider) => {
  form.provider = provider.value
  form.type = provider.supportedTypes.includes(form.type)
    ? form.type
    : (provider.supportedTypes[0] ?? 'CHAT')
  modelNameMode.value = 'recommended'

  if (!baseUrlTouched.value) {
    form.baseUrl = provider.defaultBaseUrl ?? ''
  }

  mergeConfigDefaults(provider.defaultConfigJson)

  await loadCatalogForCurrentProvider(true)
  providerPickerShouldReturnToForm.value = false
  providerPickerOpen.value = false
  formOpen.value = true
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
    const providerCatalogLoaded = await ensureCatalogProviders()

    if (
      providerCatalogLoaded &&
      catalogProviders.value.some((item) => item.value === form.provider)
    ) {
      await loadCatalogForCurrentProvider(false)
      modelNameMode.value = catalogModels.value.some((item) => item.value === form.modelName)
        ? 'recommended'
        : 'custom'
    } else if (providerCatalogLoaded) {
      catalogTypes.value = []
      catalogModels.value = []
      catalogError.value = null
      modelNameMode.value = 'custom'
    } else {
      modelNameMode.value = 'custom'
    }
  } catch (cause) {
    modelNameMode.value = 'custom'
    showErrorMessage(cause, '加载模型目录失败')
  }
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
    const name = form.name.trim()
    const baseUrl = (form.baseUrl ?? '').trim()
    const apiKey = (form.apiKey ?? '').trim()

    if (!name) {
      throw new Error('请输入配置名称')
    }

    if (!baseUrl) {
      throw new Error('请输入 API URL')
    }

    if (!editingId.value && !apiKey) {
      throw new Error('请输入 API Key')
    }

    const configJson = parseConfigJson()

    const saved = editingId.value
      ? await updateModel(editingId.value, {
          ...form,
          name,
          apiKey: apiKey || undefined,
          baseUrl,
          configJson,
        })
      : await createModel({
          ...form,
          name,
          apiKey,
          baseUrl,
          configJson,
        })

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

    <Dialog :open="providerPickerOpen" @update:open="handleProviderPickerOpenChange">
      <DialogContent class="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>选择供应商</DialogTitle>
          <DialogDescription>
            先选择模型供应商，再配置模型类型、标识和调用凭证。
          </DialogDescription>
        </DialogHeader>

        <Alert v-if="catalogError && providerOptions.length === 0" variant="destructive">
          <AlertTitle>模型目录加载失败</AlertTitle>
          <AlertDescription>{{ catalogError }}</AlertDescription>
          <AlertAction>
            <Button type="button" variant="outline" size="sm" @click="retryCatalogProviders">
              重试
            </Button>
          </AlertAction>
        </Alert>

        <div
          v-else-if="catalogLoading && providerOptions.length === 0"
          class="rounded-lg border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground"
        >
          正在加载模型目录...
        </div>

        <div v-else class="grid gap-3 sm:grid-cols-2">
          <button
            v-for="provider in providerOptions"
            :key="provider.value"
            type="button"
            class="flex min-h-36 rounded-lg border border-border bg-card p-4 text-left transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            @click="chooseProvider(provider)"
          >
            <div class="flex min-w-0 flex-1 gap-3">
              <span class="grid size-11 shrink-0 place-items-center rounded-lg bg-muted">
                <img
                  v-if="providerIconUrl(provider)"
                  :src="providerIconUrl(provider)"
                  alt=""
                  class="size-8"
                />
              </span>
              <span class="flex min-w-0 flex-1 flex-col gap-2">
                <span class="truncate text-base font-semibold text-foreground">
                  {{ provider.label }}
                </span>
                <span v-if="provider.description" class="text-sm text-muted-foreground">
                  {{ provider.description }}
                </span>
                <span class="flex flex-wrap gap-1">
                  <Badge
                    v-for="typeLabel in providerSupportedTypeLabels(provider)"
                    :key="typeLabel"
                    variant="secondary"
                  >
                    {{ typeLabel }}
                  </Badge>
                </span>
                <span v-if="provider.note" class="text-xs leading-relaxed text-muted-foreground">
                  {{ provider.note }}
                </span>
              </span>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="formOpen">
      <DialogContent class="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ title }}</DialogTitle>
          <DialogDescription> 配置模型类型、模型标识和调用凭证。 </DialogDescription>
        </DialogHeader>

        <form class="grid grid-cols-1 gap-4 md:grid-cols-2" @submit.prevent="save">
          <div class="grid gap-2">
            <Label for="model-name">配置名称 <span class="text-destructive">*</span></Label>
            <Input id="model-name" v-model="form.name" />
          </div>

          <div class="grid gap-2 md:col-span-2">
            <Label>供应商</Label>
            <div
              class="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div class="flex min-w-0 items-center gap-3">
                <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-card">
                  <img
                    v-if="providerIconUrl(selectedProviderOption)"
                    :src="providerIconUrl(selectedProviderOption)"
                    alt=""
                    class="size-7"
                  />
                </span>
                <div class="min-w-0">
                  <p class="m-0 truncate font-medium text-foreground">
                    {{ selectedProviderOption?.label ?? (form.provider || '未选择供应商') }}
                  </p>
                  <p
                    v-if="selectedProviderOption?.note || selectedProviderOption?.description"
                    class="m-0 mt-1 line-clamp-2 text-sm text-muted-foreground"
                  >
                    {{ selectedProviderOption.note || selectedProviderOption.description }}
                  </p>
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" @click="openProviderPickerFromForm">
                重新选择供应商
              </Button>
            </div>
          </div>

          <div class="grid gap-2">
            <div class="flex min-h-10 items-center">
              <Label for="model-type">模型类型</Label>
            </div>
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
            <div class="flex min-h-10 items-center justify-between gap-3">
              <Label for="model-id">模型标识</Label>
              <ToggleGroup
                :model-value="modelNameMode"
                type="single"
                variant="outline"
                size="sm"
                class="shrink-0"
                @update:model-value="handleModelNameModeChange"
              >
                <ToggleGroupItem value="recommended">推荐</ToggleGroupItem>
                <ToggleGroupItem value="custom">自定义</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <Select
              v-if="modelNameMode === 'recommended'"
              :model-value="form.modelName"
              :disabled="catalogLoading || !!catalogError || recommendedModelOptions.length === 0"
              @update:model-value="handleRecommendedModelChange"
            >
              <SelectTrigger id="model-id" class="w-full">
                <SelectValue
                  :placeholder="
                    catalogError
                      ? '目录加载失败'
                      : recommendedModelOptions.length > 0
                        ? '选择推荐模型'
                        : '暂无推荐模型'
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
            <Alert v-if="catalogError" variant="destructive">
              <AlertTitle>模型目录加载失败</AlertTitle>
              <AlertDescription>{{ catalogError }}</AlertDescription>
              <AlertAction>
                <Button type="button" variant="outline" size="sm" @click="retryCurrentCatalog">
                  重试
                </Button>
              </AlertAction>
            </Alert>
            <p
              v-else-if="
                modelNameMode === 'recommended' &&
                !catalogLoading &&
                recommendedModelOptions.length === 0
              "
              class="m-0 text-sm text-muted-foreground"
            >
              当前类型暂无推荐模型，可切换为自定义手动填写。
            </p>
          </div>

          <div class="grid gap-2 md:col-span-2">
            <Label for="model-base-url">API URL <span class="text-destructive">*</span></Label>
            <Input
              id="model-base-url"
              v-model="form.baseUrl"
              placeholder="https://api.example.com/v1"
              @update:model-value="baseUrlTouched = true"
            />
          </div>

          <div class="grid gap-2 md:col-span-2">
            <Label for="model-api-key">API Key <span class="text-destructive">*</span></Label>
            <Input
              id="model-api-key"
              v-model="form.apiKey"
              autocomplete="off"
              :placeholder="editingId ? '留空表示保持原凭证' : '请输入 API Key'"
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
            <Checkbox id="model-enabled" v-model="form.isEnabled" />
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
