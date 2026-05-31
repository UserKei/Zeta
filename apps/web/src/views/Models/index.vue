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
import {
  createModel,
  deleteModel,
  listModels,
  updateModel,
  type AiModel,
  type AiModelType,
  type ModelPayload,
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

const modelTypes: { value: AiModelType; label: string }[] = [
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
    Object.keys(model.configJson).length > 0 ? JSON.stringify(model.configJson, null, 2) : ''
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
              <TableCell class="text-muted-foreground">{{ model.provider }}</TableCell>
              <TableCell>
                <Badge variant="outline">
                  {{ modelTypes.find((item) => item.value === model.type)?.label }}
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
            <Input id="model-provider" v-model="form.provider" placeholder="OpenAI / DeepSeek" />
          </div>

          <div class="grid gap-2">
            <Label for="model-type">模型类型</Label>
            <Select v-model="form.type">
              <SelectTrigger id="model-type" class="w-full">
                <SelectValue placeholder="选择模型类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="type in modelTypes" :key="type.value" :value="type.value">
                    {{ type.label }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div class="grid gap-2">
            <Label for="model-id">模型标识</Label>
            <Input id="model-id" v-model="form.modelName" placeholder="gpt-4.1-mini" />
          </div>

          <div class="grid gap-2 md:col-span-2">
            <Label for="model-base-url">Base URL</Label>
            <Input
              id="model-base-url"
              v-model="form.baseUrl"
              placeholder="https://api.example.com/v1"
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
