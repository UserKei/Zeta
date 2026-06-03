<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  deleteKnowledgeBase,
  getKnowledgeBase,
  updateKnowledgeBase,
  type KnowledgeBase,
  type KnowledgeBaseStatus,
} from '@/apis/knowledge-bases'
import { listModels, type AiModel } from '@/apis/models'
import { showErrorMessage, showSuccessMessage } from '@/utils/feedback'

defineOptions({
  name: 'KnowledgeSettingsView',
})

const NO_VISION_MODEL = '__NO_VISION_MODEL__'
const NO_RERANKER_MODEL = '__NO_RERANKER_MODEL__'

const route = useRoute()
const router = useRouter()
const knowledgeBaseId = computed(() => String(route.params.knowledgeBaseId ?? ''))

interface KnowledgeBaseSettingsForm {
  name: string
  description: string
  status: KnowledgeBaseStatus
  embeddingModelId: string
  visionModelId: string | null
  rerankerModelId: string | null
  imageUnderstandingPrompt: string
  chunkSize: number
  chunkOverlap: number
}

const knowledgeBase = ref<KnowledgeBase | null>(null)
const models = ref<AiModel[]>([])
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const deleteOpen = ref(false)

const form = reactive<KnowledgeBaseSettingsForm>({
  name: '',
  description: '',
  status: 'ACTIVE',
  embeddingModelId: '',
  visionModelId: null,
  rerankerModelId: null,
  imageUnderstandingPrompt: '',
  chunkSize: 800,
  chunkOverlap: 100,
})

const defaultImageUnderstandingPrompt =
  '请先提取图片中的可读文字；如果图片不是纯文字内容，请用中文总结图片表达的业务信息，突出对知识检索有价值的事实。'

const embeddingModels = computed(() =>
  models.value.filter((model) => model.type === 'EMBEDDING' && model.isEnabled),
)

const visionModels = computed(() =>
  models.value.filter((model) => model.type === 'IMAGE' && model.isEnabled),
)

const rerankerModels = computed(() =>
  models.value.filter((model) => model.type === 'RERANKER' && model.isEnabled),
)

const canSave = computed(
  () =>
    form.name.trim().length > 0 &&
    form.embeddingModelId.length > 0 &&
    form.chunkSize > 0 &&
    form.chunkOverlap >= 0 &&
    form.chunkOverlap < form.chunkSize,
)

const visionModelValue = computed({
  get: () => form.visionModelId ?? NO_VISION_MODEL,
  set: (value: string) => {
    form.visionModelId = value === NO_VISION_MODEL ? null : value
  },
})

const rerankerModelValue = computed({
  get: () => form.rerankerModelId ?? NO_RERANKER_MODEL,
  set: (value: string) => {
    form.rerankerModelId = value === NO_RERANKER_MODEL ? null : value
  },
})

const handleStatusChange = (value: unknown) => {
  if (value === 'ACTIVE' || value === 'DISABLED') {
    form.status = value
  }
}

const load = async () => {
  loading.value = true

  try {
    const [knowledgeBaseDetail, modelList] = await Promise.all([
      getKnowledgeBase(knowledgeBaseId.value),
      listModels(),
    ])
    knowledgeBase.value = knowledgeBaseDetail
    models.value = modelList
    Object.assign(form, {
      name: knowledgeBaseDetail.name,
      description: knowledgeBaseDetail.description ?? '',
      status: knowledgeBaseDetail.status,
      embeddingModelId: knowledgeBaseDetail.embeddingModelId ?? '',
      visionModelId: knowledgeBaseDetail.visionModelId ?? null,
      rerankerModelId: knowledgeBaseDetail.rerankerModelId ?? null,
      imageUnderstandingPrompt:
        typeof knowledgeBaseDetail.metadata.imageUnderstandingPrompt === 'string'
          ? knowledgeBaseDetail.metadata.imageUnderstandingPrompt
          : defaultImageUnderstandingPrompt,
      chunkSize: knowledgeBaseDetail.chunkSize,
      chunkOverlap: knowledgeBaseDetail.chunkOverlap,
    })
  } catch (cause) {
    showErrorMessage(cause, '加载知识库设置失败')
  } finally {
    loading.value = false
  }
}

const save = async () => {
  if (!canSave.value) {
    return
  }

  saving.value = true

  try {
    const updated = await updateKnowledgeBase(knowledgeBaseId.value, {
      name: form.name.trim(),
      description: String(form.description ?? '').trim() || null,
      status: form.status,
      embeddingModelId: form.embeddingModelId,
      visionModelId: form.visionModelId || null,
      rerankerModelId: form.rerankerModelId || null,
      imageUnderstandingPrompt: String(form.imageUnderstandingPrompt ?? '').trim() || null,
      chunkSize: form.chunkSize,
      chunkOverlap: form.chunkOverlap,
    })
    knowledgeBase.value = updated
    showSuccessMessage('知识库设置已保存')
  } catch (cause) {
    showErrorMessage(cause, '保存知识库设置失败')
  } finally {
    saving.value = false
  }
}

const remove = () => {
  if (!knowledgeBase.value) {
    return
  }

  deleteOpen.value = true
}

const confirmRemove = async () => {
  if (!knowledgeBase.value) {
    return
  }

  deleting.value = true

  try {
    await deleteKnowledgeBase(knowledgeBase.value.id)
    deleteOpen.value = false
    await router.push({ name: 'knowledge-bases' })
  } catch (cause) {
    showErrorMessage(cause, '删除知识库失败')
  } finally {
    deleting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col bg-background p-4 text-foreground lg:p-6">
    <header class="mb-4">
      <h1 class="m-0 text-2xl font-semibold">知识库设置</h1>
      <p class="m-0 mt-1.5 text-sm text-muted-foreground">
        管理知识库基础信息、索引配置和危险操作。
      </p>
    </header>

    <div class="mx-auto grid w-full max-w-3xl gap-5">
      <Card v-if="loading">
        <CardContent class="py-8 text-sm text-muted-foreground">正在加载知识库设置...</CardContent>
      </Card>

      <template v-else>
        <Card>
          <CardHeader>
            <CardTitle>基础信息</CardTitle>
            <CardDescription>配置知识库名称、描述和启停状态。</CardDescription>
          </CardHeader>
          <CardContent>
            <form class="grid gap-4" @submit.prevent="save">
              <div class="grid gap-2">
                <Label for="knowledge-name">知识库名称</Label>
                <Input id="knowledge-name" v-model="form.name" maxlength="80" />
              </div>

              <div class="grid gap-2">
                <Label for="knowledge-description">描述</Label>
                <Textarea
                  id="knowledge-description"
                  v-model="form.description"
                  :rows="4"
                  maxlength="500"
                  placeholder="描述知识库内容，便于后续管理和检索调试"
                />
              </div>

              <div class="grid gap-2">
                <Label>状态</Label>
                <ToggleGroup
                  :model-value="form.status"
                  type="single"
                  variant="outline"
                  class="w-fit"
                  @update:model-value="handleStatusChange"
                >
                  <ToggleGroupItem value="ACTIVE">启用</ToggleGroupItem>
                  <ToggleGroupItem value="DISABLED">停用</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>索引配置</CardTitle>
            <CardDescription>配置后续导入文档时使用的索引参数。</CardDescription>
          </CardHeader>
          <CardContent class="grid gap-4">
            <Alert>
              <AlertTitle>已有分段不会自动重切</AlertTitle>
              <AlertDescription> 分段大小和重叠配置只影响后续导入或重建索引。 </AlertDescription>
            </Alert>

            <div class="grid gap-2">
              <Label>Embedding 模型</Label>
              <Select v-model="form.embeddingModelId">
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="请选择启用的 Embedding 模型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem v-for="model in embeddingModels" :key="model.id" :value="model.id">
                      {{ model.name }}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div class="grid gap-2">
              <Label>重排模型</Label>
              <Select v-model="rerankerModelValue">
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="可选：请选择启用的重排模型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem :value="NO_RERANKER_MODEL">不启用重排</SelectItem>
                    <SelectItem v-for="model in rerankerModels" :key="model.id" :value="model.id">
                      {{ model.name }}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p class="m-0 text-xs text-muted-foreground">
                启用后会先召回更多候选分段，再用重排模型筛选最终 TopK。
              </p>
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <div class="grid gap-2">
                <Label for="chunk-size">分段大小</Label>
                <Input
                  id="chunk-size"
                  v-model.number="form.chunkSize"
                  :max="5000"
                  :min="100"
                  type="number"
                />
              </div>
              <div class="grid gap-2">
                <Label for="chunk-overlap">分段重叠</Label>
                <Input
                  id="chunk-overlap"
                  v-model.number="form.chunkOverlap"
                  :max="form.chunkSize - 1"
                  :min="0"
                  type="number"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>图片理解</CardTitle>
            <CardDescription>配置 DOCX 图片和扫描 PDF 页面图的理解模型。</CardDescription>
          </CardHeader>
          <CardContent class="grid gap-4">
            <Alert>
              <AlertTitle>未配置视觉模型时</AlertTitle>
              <AlertDescription>
                DOCX 图片和扫描 PDF 页面图会保留并可预览，但不会生成图片理解分段。
              </AlertDescription>
            </Alert>

            <div class="grid gap-2">
              <Label>图片理解模型</Label>
              <Select v-model="visionModelValue">
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="可选：请选择启用的视觉模型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem :value="NO_VISION_MODEL">不启用图片理解</SelectItem>
                    <SelectItem v-for="model in visionModels" :key="model.id" :value="model.id">
                      {{ model.name }}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div class="grid gap-2">
              <Label for="image-understanding-prompt">图片理解提示词</Label>
              <Textarea
                id="image-understanding-prompt"
                v-model="form.imageUnderstandingPrompt"
                :rows="5"
                maxlength="1000"
                placeholder="用于指导视觉模型提取图片中的知识信息"
              />
            </div>
          </CardContent>
        </Card>

        <div class="flex justify-end">
          <Button :disabled="!canSave || saving" @click="save">
            {{ saving ? '保存中' : '保存设置' }}
          </Button>
        </div>

        <Card class="border-destructive/40">
          <CardHeader>
            <CardTitle class="text-destructive">危险操作</CardTitle>
            <CardDescription>
              删除知识库会同步清理文档、分段、向量、引用和 Agent 绑定关系。该操作不可恢复。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" :disabled="deleting" @click="remove">
              {{ deleting ? '删除中' : '删除知识库' }}
            </Button>
          </CardContent>
        </Card>
      </template>
    </div>

    <AlertDialog v-model:open="deleteOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除知识库</AlertDialogTitle>
          <AlertDialogDescription>
            删除知识库「{{ knowledgeBase?.name }}」？删除后文档、分段、向量和绑定关系会同步清理。
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
  </div>
</template>
