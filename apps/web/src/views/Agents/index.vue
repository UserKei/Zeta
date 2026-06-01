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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { createAgent, deleteAgent, listAgents, type Agent, type AgentStatus } from '@/apis/agents'
import { showErrorMessage } from '@/utils/feedback'

defineOptions({
  name: 'AgentsView',
})

const router = useRouter()
const agents = ref<Agent[]>([])
const loading = ref(false)
const creating = ref(false)
const deleting = ref(false)
const createOpen = ref(false)
const deleteOpen = ref(false)
const deletingAgent = ref<Agent | null>(null)

const createForm = reactive({
  name: '',
  description: '',
})

const canCreate = computed(() => createForm.name.trim().length > 0)

const load = async () => {
  loading.value = true

  try {
    agents.value = await listAgents()
  } catch (cause) {
    showErrorMessage(cause, '加载 Agent 失败')
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  Object.assign(createForm, {
    name: '',
    description: '',
  })
  createOpen.value = true
}

const create = async () => {
  if (!canCreate.value) {
    return
  }

  creating.value = true

  try {
    const saved = await createAgent({
      name: createForm.name.trim(),
      description: createForm.description.trim() || null,
    })
    agents.value.unshift(saved)
    createOpen.value = false
    await router.push({ name: 'agent-settings', params: { agentId: saved.id } })
  } catch (cause) {
    showErrorMessage(cause, '创建 Agent 失败')
  } finally {
    creating.value = false
  }
}

const openSettings = (agent: Agent) => {
  router.push({ name: 'agent-settings', params: { agentId: agent.id } })
}

const remove = (agent: Agent) => {
  deletingAgent.value = agent
  deleteOpen.value = true
}

const confirmRemove = async () => {
  if (!deletingAgent.value) {
    return
  }

  deleting.value = true

  try {
    await deleteAgent(deletingAgent.value.id)
    agents.value = agents.value.filter((item) => item.id !== deletingAgent.value?.id)
    deleteOpen.value = false
    deletingAgent.value = null
  } catch (cause) {
    showErrorMessage(cause, '删除 Agent 失败')
  } finally {
    deleting.value = false
  }
}

const canChat = (agent: Agent) => Boolean(agent.model) && agent.knowledgeBases.length > 0

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const statusText = (status: AgentStatus) =>
  ({
    DRAFT: '草稿',
    PUBLISHED: '已发布',
    DISABLED: '停用',
  })[status]

const statusBadgeVariant = (status: AgentStatus) => {
  if (status === 'PUBLISHED') {
    return 'default'
  }

  if (status === 'DRAFT') {
    return 'secondary'
  }

  return 'outline'
}

onMounted(load)
</script>

<template>
  <Card class="m-4 gap-4 overflow-hidden p-4 lg:m-6 lg:p-6">
    <CardHeader
      class="flex flex-col items-start justify-between gap-4 px-0 pt-0 lg:flex-row lg:items-center"
    >
      <div>
        <CardTitle class="text-[34px] font-bold text-foreground">专家 Agent</CardTitle>
      </div>
      <Button @click="openCreate">创建 Agent</Button>
    </CardHeader>

    <Alert class="border-border bg-muted/40 text-muted-foreground">
      <AlertDescription>
        Agent 可以先创建为草稿，随后进入设置页配置模型、知识库和回答策略。
      </AlertDescription>
    </Alert>

    <CardContent class="min-w-0 overflow-hidden rounded-lg border border-border p-0">
      <Table>
        <TableHeader>
          <TableRow class="bg-muted/60 hover:bg-muted/60">
            <TableHead class="min-w-60">名称</TableHead>
            <TableHead class="min-w-55">模型</TableHead>
            <TableHead class="min-w-60">绑定知识库</TableHead>
            <TableHead class="min-w-24">状态</TableHead>
            <TableHead class="min-w-36">更新时间</TableHead>
            <TableHead class="min-w-64 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="loading">
            <TableCell colspan="6" class="h-24 text-center text-muted-foreground">
              正在加载 Agent...
            </TableCell>
          </TableRow>
          <TableRow v-else-if="agents.length === 0">
            <TableCell colspan="6" class="h-24 text-center text-muted-foreground">
              还没有 Agent
            </TableCell>
          </TableRow>
          <template v-else>
            <TableRow v-for="agent in agents" :key="agent.id">
              <TableCell>
                <div class="grid gap-1">
                  <strong class="font-semibold text-foreground">{{ agent.name }}</strong>
                  <small class="text-muted-foreground">
                    {{ agent.description || agent.openingMessage || '暂无描述' }}
                  </small>
                </div>
              </TableCell>
              <TableCell>
                <div v-if="agent.model" class="grid gap-1">
                  <strong class="font-semibold text-foreground">{{ agent.model.name }}</strong>
                  <small class="text-muted-foreground">
                    {{ agent.model.provider }} / {{ agent.model.modelName }}
                  </small>
                </div>
                <div v-else class="grid gap-1">
                  <Badge variant="outline">未配置对话模型</Badge>
                  <small class="text-muted-foreground">进入设置页选择模型</small>
                </div>
              </TableCell>
              <TableCell>
                <div class="grid gap-1">
                  <strong class="font-semibold text-foreground">
                    {{ agent.knowledgeBases.length }} 个知识库
                  </strong>
                  <small class="text-muted-foreground">
                    {{ agent.knowledgeBases.map((item) => item.name).join('、') || '未绑定' }}
                  </small>
                </div>
              </TableCell>
              <TableCell>
                <Badge :variant="statusBadgeVariant(agent.status)">
                  {{ statusText(agent.status) }}
                </Badge>
              </TableCell>
              <TableCell class="text-muted-foreground">
                {{ formatTime(agent.updatedAt) }}
              </TableCell>
              <TableCell>
                <div class="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="!canChat(agent)"
                    @click="router.push({ name: 'agent-chat', params: { agentId: agent.id } })"
                  >
                    聊天
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    @click="router.push({ name: 'agent-chat-logs', params: { agentId: agent.id } })"
                  >
                    日志
                  </Button>
                  <Button variant="outline" size="sm" @click="openSettings(agent)">编辑</Button>
                  <Button variant="destructive" size="sm" @click="remove(agent)">删除</Button>
                </div>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
    </CardContent>

    <Dialog v-model:open="createOpen">
      <DialogContent class="sm:max-w-160">
        <DialogHeader>
          <DialogTitle>创建 Agent</DialogTitle>
          <DialogDescription>
            先填写名称和描述，创建后进入设置页完善模型、知识库和 Prompt。
          </DialogDescription>
        </DialogHeader>

        <form class="grid gap-4" @submit.prevent="create">
          <div class="grid gap-2">
            <Label for="agent-name">名称</Label>
            <Input
              id="agent-name"
              v-model="createForm.name"
              maxlength="64"
              placeholder="请输入 Agent 名称"
            />
          </div>

          <div class="grid gap-2">
            <Label for="agent-description">描述</Label>
            <Textarea
              id="agent-description"
              v-model="createForm.description"
              maxlength="256"
              placeholder="描述该 Agent 的应用场景和用途"
              class="min-h-28"
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" :disabled="creating" @click="createOpen = false">取消</Button>
          <Button :disabled="!canCreate || creating" @click="create">
            {{ creating ? '创建中...' : '创建' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog v-model:open="deleteOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除 Agent</AlertDialogTitle>
          <AlertDialogDescription>
            确定删除 Agent「{{ deletingAgent?.name }}」？相关会话和绑定关系会同步清理。
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
