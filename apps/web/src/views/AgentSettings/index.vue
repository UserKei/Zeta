<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { getAgent, updateAgent, type Agent, type AgentStatus } from '@/apis/agents'
import { listKnowledgeBases, type KnowledgeBase } from '@/apis/knowledge-bases'
import { listModels, type AiModel } from '@/apis/models'
import { showErrorMessage, showSuccessMessage } from '@/utils/feedback'

defineOptions({
  name: 'AgentSettingsView',
})

const NO_CHAT_MODEL = '__NO_CHAT_MODEL__'
const defaultSystemPrompt = '你是企业知识库专家，请基于知识库上下文回答问题。'

interface AgentSettingsForm {
  name: string
  description: string
  modelId: string | null
  knowledgeBaseIds: string[]
  systemPrompt: string
  openingMessage: string
  status: AgentStatus
  temperature: number | null
  topP: number | null
}

const route = useRoute()
const agentId = computed(() => String(route.params.agentId ?? ''))

const agent = ref<Agent | null>(null)
const models = ref<AiModel[]>([])
const knowledgeBases = ref<KnowledgeBase[]>([])
const loading = ref(false)
const saving = ref(false)

const form = reactive<AgentSettingsForm>({
  name: '',
  description: '',
  modelId: null,
  knowledgeBaseIds: [],
  systemPrompt: defaultSystemPrompt,
  openingMessage: '你好，我可以基于已绑定知识库回答问题。',
  status: 'DRAFT',
  temperature: 0.2,
  topP: 0.8,
})

const chatModels = computed(() =>
  models.value.filter((model) => model.type === 'CHAT' && model.isEnabled),
)

const activeKnowledgeBases = computed(() =>
  knowledgeBases.value.filter(
    (knowledgeBase) => knowledgeBase.status === 'ACTIVE' && knowledgeBase.embeddingModel,
  ),
)

const canSave = computed(() => form.name.trim().length > 0 && form.systemPrompt.trim().length > 0)

const chatModelValue = computed({
  get: () => form.modelId ?? NO_CHAT_MODEL,
  set: (value: string) => {
    form.modelId = value === NO_CHAT_MODEL ? null : value
  },
})

const temperatureValue = computed<string | number>({
  get: () => form.temperature ?? '',
  set: (value) => {
    form.temperature = value === '' ? null : Number(value)
  },
})

const topPValue = computed<string | number>({
  get: () => form.topP ?? '',
  set: (value) => {
    form.topP = value === '' ? null : Number(value)
  },
})

const missingConfig = computed(() => {
  const missing: string[] = []

  if (!form.modelId) {
    missing.push('对话模型')
  }

  if (form.knowledgeBaseIds.length === 0) {
    missing.push('知识库')
  }

  return missing
})

const modelLabel = (model: AiModel) => `${model.name} - ${model.provider} / ${model.modelName}`

const load = async () => {
  loading.value = true

  try {
    const [agentDetail, modelList, knowledgeBaseList] = await Promise.all([
      getAgent(agentId.value),
      listModels(),
      listKnowledgeBases(),
    ])
    agent.value = agentDetail
    models.value = modelList
    knowledgeBases.value = knowledgeBaseList
    Object.assign(form, {
      name: agentDetail.name,
      description: agentDetail.description ?? '',
      modelId: agentDetail.modelId,
      knowledgeBaseIds: agentDetail.knowledgeBases.map((knowledgeBase) => knowledgeBase.id),
      systemPrompt: agentDetail.systemPrompt || defaultSystemPrompt,
      openingMessage: agentDetail.openingMessage ?? '',
      status: agentDetail.status,
      temperature: agentDetail.temperature,
      topP: agentDetail.topP,
    })
  } catch (cause) {
    showErrorMessage(cause, '加载 Agent 设置失败')
  } finally {
    loading.value = false
  }
}

const toggleKnowledgeBase = (knowledgeBaseId: string, checked: boolean | 'indeterminate') => {
  if (checked === true) {
    if (!form.knowledgeBaseIds.includes(knowledgeBaseId)) {
      form.knowledgeBaseIds.push(knowledgeBaseId)
    }

    return
  }

  form.knowledgeBaseIds = form.knowledgeBaseIds.filter((id) => id !== knowledgeBaseId)
}

const normalizeOptionalNumber = (value: unknown) => {
  if (value === '' || value === null || value === undefined) {
    return null
  }

  return Number(value)
}

const save = async () => {
  if (!canSave.value) {
    return
  }

  saving.value = true

  try {
    const saved = await updateAgent(agentId.value, {
      name: form.name.trim(),
      description: form.description.trim() || null,
      modelId: form.modelId,
      knowledgeBaseIds: [...form.knowledgeBaseIds],
      systemPrompt: form.systemPrompt.trim(),
      openingMessage: form.openingMessage.trim() || null,
      status: form.status,
      temperature: normalizeOptionalNumber(form.temperature),
      topP: normalizeOptionalNumber(form.topP),
    })
    agent.value = saved
    showSuccessMessage('Agent 设置已保存')
  } catch (cause) {
    showErrorMessage(cause, '保存 Agent 设置失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col bg-background p-4 text-foreground lg:p-6">
    <header class="mb-4 flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="m-0 text-2xl font-semibold">Agent 设置</h1>
        <Badge v-if="agent" variant="secondary">{{ agent.status }}</Badge>
      </div>
      <p class="m-0 text-sm text-muted-foreground">
        配置 Agent 的对话模型、知识库绑定和回答策略。草稿可以先保存，聊天前再补齐配置。
      </p>
    </header>

    <div class="mx-auto grid w-full max-w-3xl gap-5">
      <Card v-if="loading">
        <CardContent class="py-8 text-sm text-muted-foreground">正在加载 Agent 设置...</CardContent>
      </Card>

      <template v-else>
        <Alert v-if="missingConfig.length > 0" class="border-border bg-muted/40">
          <AlertTitle>当前 Agent 还不能聊天</AlertTitle>
          <AlertDescription>
            请在聊天前补齐 {{ missingConfig.join('、') }}。你仍然可以先保存为草稿。
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>基础信息</CardTitle>
            <CardDescription>名称会显示在 Agent 列表和对话入口中。</CardDescription>
          </CardHeader>
          <CardContent class="grid gap-4">
            <div class="grid gap-2">
              <Label for="agent-name">Agent 名称</Label>
              <Input id="agent-name" v-model="form.name" maxlength="80" />
            </div>

            <div class="grid gap-2">
              <Label for="agent-description">描述</Label>
              <Textarea
                id="agent-description"
                v-model="form.description"
                maxlength="256"
                placeholder="例如：回答 IT 服务台、采购制度、报销流程相关问题"
                class="min-h-24"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>模型与知识库</CardTitle>
            <CardDescription>选择一个启用的对话模型，并绑定可检索知识库。</CardDescription>
          </CardHeader>
          <CardContent class="grid gap-4">
            <div class="grid gap-2">
              <Label>对话模型</Label>
              <Select v-model="chatModelValue">
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="请选择对话模型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem :value="NO_CHAT_MODEL">暂不配置</SelectItem>
                    <SelectItem v-for="model in chatModels" :key="model.id" :value="model.id">
                      {{ modelLabel(model) }}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div class="grid gap-2">
              <Label>绑定知识库</Label>
              <div class="grid max-h-60 gap-2 overflow-auto rounded-lg border border-border p-3">
                <label
                  v-for="knowledgeBase in activeKnowledgeBases"
                  :key="knowledgeBase.id"
                  class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox
                    :checked="form.knowledgeBaseIds.includes(knowledgeBase.id)"
                    @update:checked="toggleKnowledgeBase(knowledgeBase.id, $event)"
                  />
                  <span class="font-medium text-foreground">{{ knowledgeBase.name }}</span>
                </label>
                <p
                  v-if="activeKnowledgeBases.length === 0"
                  class="px-2 py-1.5 text-sm text-muted-foreground"
                >
                  还没有可绑定的启用知识库
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>回答策略</CardTitle>
            <CardDescription>控制开场白、系统提示词和采样参数。</CardDescription>
          </CardHeader>
          <CardContent class="grid gap-4">
            <div class="grid gap-2">
              <Label>状态</Label>
              <Select v-model="form.status">
                <SelectTrigger class="w-full">
                  <SelectValue placeholder="请选择状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="DRAFT">草稿</SelectItem>
                    <SelectItem value="PUBLISHED">已发布</SelectItem>
                    <SelectItem value="DISABLED">停用</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <div class="grid gap-2">
                <Label for="agent-temperature">Temperature</Label>
                <Input
                  id="agent-temperature"
                  v-model.number="temperatureValue"
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                />
              </div>

              <div class="grid gap-2">
                <Label for="agent-top-p">Top P</Label>
                <Input
                  id="agent-top-p"
                  v-model.number="topPValue"
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                />
              </div>
            </div>

            <div class="grid gap-2">
              <Label for="agent-opening-message">开场白</Label>
              <Textarea id="agent-opening-message" v-model="form.openingMessage" class="min-h-24" />
            </div>

            <div class="grid gap-2">
              <Label for="agent-system-prompt">Prompt</Label>
              <Textarea id="agent-system-prompt" v-model="form.systemPrompt" class="min-h-44" />
            </div>
          </CardContent>
          <CardFooter class="justify-end gap-2">
            <Button :disabled="!canSave || saving" @click="save">
              {{ saving ? '保存中...' : '保存设置' }}
            </Button>
          </CardFooter>
        </Card>
      </template>
    </div>
  </div>
</template>
