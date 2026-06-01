<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ChartNoAxesColumnIncreasingIcon,
  ClockIcon,
  FileTextIcon,
  LinkIcon,
} from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  getKnowledgeBaseUsage,
  type KnowledgeUsageRange,
  type KnowledgeUsageSummary,
} from '@/apis/knowledge-bases'
import { showErrorMessage } from '@/utils/feedback'

defineOptions({
  name: 'KnowledgeUsageView',
})

const route = useRoute()
const router = useRouter()
const knowledgeBaseId = computed(() => String(route.params.knowledgeBaseId ?? ''))

const loading = ref(false)
const range = ref<KnowledgeUsageRange>('30d')
const usage = ref<KnowledgeUsageSummary | null>(null)

const rangeOptions: Array<{ label: string; value: KnowledgeUsageRange }> = [
  { label: '近 7 天', value: '7d' },
  { label: '近 30 天', value: '30d' },
  { label: '全部', value: 'all' },
]

const summaryCards = computed(() => [
  {
    label: '总引用次数',
    value: usage.value?.totalCitations ?? 0,
    icon: ChartNoAxesColumnIncreasingIcon,
  },
  {
    label: '被引用文档',
    value: usage.value?.citedDocumentCount ?? 0,
    icon: FileTextIcon,
  },
  {
    label: '被引用分段',
    value: usage.value?.citedChunkCount ?? 0,
    icon: LinkIcon,
  },
  {
    label: '最近引用',
    value: usage.value?.lastCitedAt ? formatTime(usage.value.lastCitedAt) : '-',
    icon: ClockIcon,
  },
])

const load = async () => {
  loading.value = true

  try {
    usage.value = await getKnowledgeBaseUsage(knowledgeBaseId.value, range.value)
  } catch (cause) {
    showErrorMessage(cause, '加载知识热度失败')
  } finally {
    loading.value = false
  }
}

const sourceText = (sourceType: string) =>
  (
    {
      MANUAL: '手动录入',
      FILE_UPLOAD: '文件导入',
      AI_EXTRACTED: 'AI 提炼',
      WEB_IMPORT: '网页导入',
    } as Record<string, string>
  )[sourceType] ?? sourceType

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const goChunk = (documentId: string, chunkId: string) => {
  void router.push({
    name: 'paragraph',
    params: {
      knowledgeBaseId: knowledgeBaseId.value,
      documentId,
    },
    query: { chunkId },
  })
}

watch(range, load)

onMounted(load)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col p-4 lg:p-6">
    <header class="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
      <div>
        <h1 class="m-0 text-2xl font-semibold text-foreground">知识热度</h1>
        <p class="m-0 mt-1.5 text-sm text-muted-foreground">
          只统计 Agent 回答中真实产生的引用，不包含检索测试。
        </p>
      </div>
      <div class="flex w-fit rounded-lg border border-border bg-card p-1">
        <Button
          v-for="option in rangeOptions"
          :key="option.value"
          :variant="range === option.value ? 'secondary' : 'ghost'"
          size="sm"
          type="button"
          @click="range = option.value"
        >
          {{ option.label }}
        </Button>
      </div>
    </header>

    <section class="relative grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4">
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card v-for="card in summaryCards" :key="card.label" size="sm">
          <CardContent class="flex items-center gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <component :is="card.icon" class="size-4" />
            </span>
            <div>
              <p class="m-0 text-sm text-muted-foreground">{{ card.label }}</p>
              <strong class="mt-1 block text-2xl text-foreground">{{ card.value }}</strong>
            </div>
          </CardContent>
        </Card>
      </div>

      <div class="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card class="min-h-0 gap-0 py-0">
          <CardHeader class="border-b border-border py-4">
            <div class="flex items-center justify-between">
              <CardTitle>热门文档</CardTitle>
              <CardDescription>
                {{ usage?.topDocuments.length ?? 0 }} 个文档
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent class="min-h-0 flex-1 overflow-auto p-0">
            <div
              v-if="!usage || usage.topDocuments.length === 0"
              class="grid min-h-48 place-items-center p-6 text-center text-muted-foreground"
            >
              暂无引用数据
            </div>
            <Table v-else>
              <TableHeader>
                <TableRow>
                  <TableHead>文档</TableHead>
                  <TableHead class="text-center">引用</TableHead>
                  <TableHead class="text-center">分段</TableHead>
                  <TableHead>最近引用</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="document in usage.topDocuments" :key="document.documentId">
                  <TableCell class="min-w-56 whitespace-normal">
                    <div class="grid gap-1">
                      <strong class="truncate text-foreground" :title="document.documentName">
                        {{ document.documentName }}
                      </strong>
                      <small class="text-muted-foreground">{{ sourceText(document.sourceType) }}</small>
                    </div>
                  </TableCell>
                  <TableCell class="text-center">
                    <Badge>{{ document.citationCount }}</Badge>
                  </TableCell>
                  <TableCell class="text-center">{{ document.citedChunkCount }}</TableCell>
                  <TableCell>{{ formatTime(document.lastCitedAt) }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card class="min-h-0 gap-0 py-0">
          <CardHeader class="border-b border-border py-4">
            <div class="flex items-center justify-between">
              <CardTitle>热门分段</CardTitle>
              <CardDescription>
                {{ usage?.topChunks.length ?? 0 }} 个分段
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent class="min-h-0 flex-1 overflow-auto p-4">
            <div
              v-if="!usage || usage.topChunks.length === 0"
              class="grid min-h-48 place-items-center text-center text-muted-foreground"
            >
              暂无引用数据
            </div>
            <div v-else class="grid gap-3">
              <Card
                v-for="chunk in usage.topChunks"
                :key="chunk.chunkId"
                size="sm"
              >
                <CardContent>
                  <header class="mb-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                    <div class="min-w-0">
                      <strong class="block truncate text-foreground" :title="chunk.title || '-'">
                        {{ chunk.title || '未命名分段' }}
                      </strong>
                      <p class="m-0 mt-1 text-xs text-muted-foreground">
                        {{ chunk.documentName }} · 分段 #{{ chunk.chunkPosition + 1 }}
                      </p>
                    </div>
                    <Badge>
                      引用 {{ chunk.citationCount }}
                    </Badge>
                  </header>

                  <p class="m-0 line-clamp-3 text-sm leading-6 text-foreground">
                    {{ chunk.preview || '暂无内容摘要' }}
                  </p>

                  <footer class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>最近引用 {{ formatTime(chunk.lastCitedAt) }}</span>
                    <Button variant="link" size="sm" type="button" @click="goChunk(chunk.documentId, chunk.chunkId)">
                      查看分段
                    </Button>
                  </footer>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>

      <div
        v-if="loading"
        class="absolute inset-0 grid place-items-center rounded-lg bg-background/70 text-sm text-muted-foreground backdrop-blur-sm"
      >
        加载知识热度...
      </div>
    </section>
  </div>
</template>
