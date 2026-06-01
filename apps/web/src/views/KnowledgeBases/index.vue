<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  createKnowledgeBase,
  deleteKnowledgeBase,
  listKnowledgeBases,
  updateKnowledgeBase,
  type KnowledgeBase,
  type KnowledgeBasePayload,
  type KnowledgeBaseStatus,
} from '@/apis/knowledge-bases'
import { listModels, type AiModel } from '@/apis/models'
import { showErrorMessage } from '@/utils/feedback'

defineOptions({
  name: 'KnowledgeBasesView',
})

const router = useRouter()
const knowledgeBases = ref<KnowledgeBase[]>([])
const models = ref<AiModel[]>([])
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const editingId = ref<string | null>(null)
const formOpen = ref(false)
const deleteOpen = ref(false)
const deletingKnowledgeBase = ref<KnowledgeBase | null>(null)
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
    const matchedStatus = statusFilter.value === '' || knowledgeBase.status === statusFilter.value
    const searchableText = [
      knowledgeBase.name,
      knowledgeBase.description ?? '',
      knowledgeBase.embeddingModel?.name ?? '未配置 Embedding 模型',
      knowledgeBase.embeddingModel?.provider ?? '',
      knowledgeBase.embeddingModel?.modelName ?? '',
    ]
      .join(' ')
      .toLowerCase()

    return matchedStatus && (!query || searchableText.includes(query))
  })
})

const activeCount = computed(
  () => knowledgeBases.value.filter((item) => item.status === 'ACTIVE').length,
)

const statusFilterValue = computed({
  get: () => statusFilter.value || 'ALL',
  set: (value: string) => {
    statusFilter.value = value === 'ALL' ? '' : (value as KnowledgeBaseStatus)
  },
})

const descriptionValue = computed({
  get: () => form.description ?? '',
  set: (value: string) => {
    form.description = value
  },
})

const load = async () => {
  loading.value = true

  try {
    const [knowledgeBaseList, modelList] = await Promise.all([listKnowledgeBases(), listModels()])
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
    embeddingModelId: knowledgeBase.embeddingModelId ?? '',
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

const remove = (knowledgeBase: KnowledgeBase) => {
  deletingKnowledgeBase.value = knowledgeBase
  deleteOpen.value = true
}

const confirmRemove = async () => {
  if (!deletingKnowledgeBase.value) {
    return
  }

  deleting.value = true

  try {
    await deleteKnowledgeBase(deletingKnowledgeBase.value.id)
    knowledgeBases.value = knowledgeBases.value.filter(
      (item) => item.id !== deletingKnowledgeBase.value?.id,
    )
    deleteOpen.value = false
    deletingKnowledgeBase.value = null
  } catch (cause) {
    showErrorMessage(cause, '删除知识库失败')
  } finally {
    deleting.value = false
  }
}

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const statusText = (status: KnowledgeBaseStatus) => (status === 'ACTIVE' ? '启用' : '停用')

onMounted(load)
</script>

<template>
  <Card class="m-4 gap-4 overflow-hidden p-4 lg:m-6 lg:p-6">
    <CardHeader
      class="flex flex-col items-start justify-between gap-4 px-0 pt-0 lg:flex-row lg:items-center"
    >
      <div>
        <CardTitle class="text-[34px] font-bold text-foreground">知识库</CardTitle>
        <p class="mt-1.5 text-sm text-muted-foreground">
          共 {{ knowledgeBases.length }} 个知识库，{{ activeCount }} 个启用
        </p>
      </div>
      <Button @click="openCreate">创建知识库</Button>
    </CardHeader>

    <Alert
      v-if="embeddingModels.length === 0"
      class="border-border bg-muted/40 text-muted-foreground"
    >
      <AlertDescription>
        还没有可用的 Embedding 模型。请先在模型管理里添加并启用一个 Embedding 模型。
      </AlertDescription>
    </Alert>

    <CardContent class="min-w-0 overflow-hidden rounded-lg border border-border p-0">
      <div
        class="flex flex-col justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3 lg:flex-row lg:items-center"
      >
        <div class="flex flex-wrap items-center gap-2">
          <Button @click="openCreate">创建</Button>
          <Button variant="outline" :disabled="loading" @click="load">
            {{ loading ? '刷新中' : '刷新' }}
          </Button>
          <span class="text-sm text-muted-foreground">
            当前 {{ filteredKnowledgeBases.length }} / {{ knowledgeBases.length }}
          </span>
        </div>
        <div class="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <Select v-model="statusFilterValue">
            <SelectTrigger class="w-full sm:w-36">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="ALL">全部状态</SelectItem>
                <SelectItem value="ACTIVE">启用</SelectItem>
                <SelectItem value="DISABLED">停用</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input v-model="keyword" placeholder="搜索知识库" class="w-full sm:w-64" />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow class="bg-muted/60 hover:bg-muted/60">
            <TableHead class="min-w-55">名称</TableHead>
            <TableHead class="min-w-60">Embedding 模型</TableHead>
            <TableHead class="min-w-32">分块配置</TableHead>
            <TableHead class="min-w-24">状态</TableHead>
            <TableHead class="min-w-36">更新时间</TableHead>
            <TableHead class="min-w-52 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="loading">
            <TableCell colspan="6" class="h-24 text-center text-muted-foreground">
              正在加载知识库...
            </TableCell>
          </TableRow>
          <TableRow v-else-if="filteredKnowledgeBases.length === 0">
            <TableCell colspan="6" class="h-24 text-center text-muted-foreground">
              还没有知识库
            </TableCell>
          </TableRow>
          <template v-else>
            <TableRow v-for="knowledgeBase in filteredKnowledgeBases" :key="knowledgeBase.id">
              <TableCell>
                <div class="grid gap-1">
                  <button
                    class="w-fit text-left font-semibold text-primary hover:underline"
                    @click="
                      router.push({
                        name: 'knowledge-documents',
                        params: { knowledgeBaseId: knowledgeBase.id },
                      })
                    "
                  >
                    {{ knowledgeBase.name }}
                  </button>
                  <small class="text-muted-foreground">
                    {{ knowledgeBase.description || '暂无描述' }}
                  </small>
                </div>
              </TableCell>
              <TableCell>
                <div v-if="knowledgeBase.embeddingModel" class="grid gap-1">
                  <strong class="font-semibold text-foreground">
                    {{ knowledgeBase.embeddingModel.name }}
                  </strong>
                  <small class="text-muted-foreground">
                    {{ knowledgeBase.embeddingModel.provider }} /
                    {{ knowledgeBase.embeddingModel.modelName }}
                  </small>
                </div>
                <div v-else class="grid gap-1">
                  <Badge variant="outline"> 未配置 Embedding 模型 </Badge>
                  <small class="text-muted-foreground">请编辑知识库重新选择模型</small>
                </div>
              </TableCell>
              <TableCell>
                <div class="grid gap-1">
                  <strong class="font-semibold text-foreground">{{
                    knowledgeBase.chunkSize
                  }}</strong>
                  <small class="text-muted-foreground">
                    重叠长度 {{ knowledgeBase.chunkOverlap }}
                  </small>
                </div>
              </TableCell>
              <TableCell>
                <Badge :variant="knowledgeBase.status === 'ACTIVE' ? 'default' : 'secondary'">
                  {{ statusText(knowledgeBase.status) }}
                </Badge>
              </TableCell>
              <TableCell class="text-muted-foreground">
                {{ formatTime(knowledgeBase.updatedAt) }}
              </TableCell>
              <TableCell>
                <div class="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    @click="
                      router.push({
                        name: 'knowledge-documents',
                        params: { knowledgeBaseId: knowledgeBase.id },
                      })
                    "
                  >
                    进入
                  </Button>
                  <Button variant="outline" size="sm" @click="openEdit(knowledgeBase)">
                    编辑
                  </Button>
                  <Button variant="destructive" size="sm" @click="remove(knowledgeBase)">
                    删除
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
    </CardContent>

    <Dialog v-model:open="formOpen">
      <DialogContent class="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{{ title }}</DialogTitle>
          <DialogDescription>
            设置知识库基础信息、Embedding 模型和后续导入使用的默认分块参数。
          </DialogDescription>
        </DialogHeader>

        <Alert
          v-if="embeddingModels.length === 0"
          class="border-border bg-muted/40 text-muted-foreground"
        >
          <AlertDescription>
            创建知识库前需要先配置一个启用状态的 Embedding 模型。
          </AlertDescription>
        </Alert>

        <form class="grid grid-cols-1 gap-3.5 md:grid-cols-2" @submit.prevent="save">
          <div class="grid gap-2">
            <Label for="knowledge-base-name">知识库名称</Label>
            <Input id="knowledge-base-name" v-model="form.name" />
          </div>

          <div class="grid gap-2">
            <Label>状态</Label>
            <Select v-model="form.status">
              <SelectTrigger class="w-full">
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
            <Label for="knowledge-base-description">描述</Label>
            <Textarea
              id="knowledge-base-description"
              v-model="descriptionValue"
              placeholder="例如：人事制度、采购流程、IT 支持"
              class="min-h-20"
            />
          </div>

          <div class="grid gap-2 md:col-span-2">
            <Label>Embedding 模型</Label>
            <Select v-model="form.embeddingModelId" :disabled="embeddingModels.length === 0">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="请选择 Embedding 模型" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="model in embeddingModels" :key="model.id" :value="model.id">
                    {{ model.name }} - {{ model.provider }} / {{ model.modelName }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div class="grid gap-2">
            <Label for="knowledge-base-chunk-size">分块大小</Label>
            <Input
              id="knowledge-base-chunk-size"
              v-model.number="form.chunkSize"
              type="number"
              min="1"
            />
          </div>

          <div class="grid gap-2">
            <Label for="knowledge-base-chunk-overlap">重叠长度</Label>
            <Input
              id="knowledge-base-chunk-overlap"
              v-model.number="form.chunkOverlap"
              type="number"
              min="0"
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" @click="formOpen = false">取消</Button>
          <Button :disabled="embeddingModels.length === 0 || saving" @click="save">
            {{ saving ? '保存中' : '保存' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog v-model:open="deleteOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除知识库</AlertDialogTitle>
          <AlertDialogDescription>
            确定删除知识库「{{
              deletingKnowledgeBase?.name
            }}」？相关文档、分段、向量和文件都会同步清理。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="deleting">取消</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            :disabled="deleting"
            @click.prevent="confirmRemove"
          >
            {{ deleting ? '删除中' : '删除' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </Card>
</template>
