<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { SearchIcon } from '@lucide/vue'
import { useRoute } from 'vue-router'
import { Badge, type BadgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  testKnowledgeBaseRetrieval,
  type RetrievalHit,
  type RetrievalResult,
} from '@/apis/knowledge-docs'
import { showErrorMessage } from '@/utils/feedback'

defineOptions({
  name: 'KnowledgeRetrievalView',
})

const route = useRoute()
const knowledgeBaseId = computed(() => String(route.params.knowledgeBaseId ?? ''))

const loading = ref(false)
const result = ref<RetrievalResult | null>(null)
const form = reactive({
  question: '',
  topK: 5,
})

const normalizedTopK = computed(() => {
  const value = Number(form.topK)

  if (!Number.isFinite(value)) {
    return 5
  }

  return Math.min(20, Math.max(1, Math.trunc(value)))
})

const canSearch = computed(() => form.question.trim().length > 0 && !loading.value)

const runRetrieval = async () => {
  if (!canSearch.value) {
    return
  }

  loading.value = true

  try {
    result.value = await testKnowledgeBaseRetrieval(knowledgeBaseId.value, {
      question: form.question,
      topK: normalizedTopK.value,
    })
  } catch (cause) {
    showErrorMessage(cause, '检索测试失败')
  } finally {
    loading.value = false
  }
}

const formatScore = (value: number | null) =>
  value === null ? '-' : `${(value * 100).toFixed(1)}%`

const matchReasonText = (reason: RetrievalHit['matchReason']) =>
  ({
    VECTOR: '语义命中',
    KEYWORD: '关键词命中',
    HYBRID: '混合命中',
  })[reason]

const matchReasonVariant = (reason: RetrievalHit['matchReason']): BadgeVariants['variant'] =>
  ({
    VECTOR: 'secondary',
    KEYWORD: 'outline',
    HYBRID: 'default',
  } as const)[reason]
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col p-4 lg:p-6">
    <header class="mb-4">
      <h1 class="m-0 text-2xl font-semibold text-foreground">检索测试</h1>
      <p class="m-0 mt-1.5 text-sm text-muted-foreground">
        输入问题，查看知识库分段的命中原因和综合评分。
      </p>
    </header>

    <Card class="min-h-0 flex-1 gap-0 py-0">
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div v-if="!result" class="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <div class="grid justify-items-center gap-2 text-muted-foreground">
            <SearchIcon class="size-10" />
            <p class="m-0 font-medium text-foreground">命中分段会显示在这里</p>
            <p class="m-0 text-sm">输入问题后可以查看召回原因和评分。</p>
          </div>
        </div>

        <div v-else-if="result.hits.length === 0" class="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <div class="grid justify-items-center gap-2 text-muted-foreground">
            <SearchIcon class="size-10" />
            <p class="m-0 font-medium text-foreground">没有命中的分段</p>
            <p class="m-0 text-sm">可以换一个更具体的问题，或检查知识库是否已经完成索引。</p>
          </div>
        </div>

        <div v-else class="min-h-0 flex-1 overflow-auto p-4">
          <div class="mb-4 flex min-w-0 items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-full bg-background text-muted-foreground ring-1 ring-border">
              <SearchIcon class="size-4" />
            </span>
            <div class="min-w-0">
              <p class="m-0 truncate font-semibold text-foreground" :title="result.question">
                {{ result.question }}
              </p>
              <p class="m-0 mt-1 text-sm text-muted-foreground">
                返回 Top {{ result.topK }}，实际命中 {{ result.hits.length }} 个分段
              </p>
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Card
              v-for="(hit, index) in result.hits"
              :key="hit.chunkId"
              class="min-h-0"
            >
              <CardHeader class="mb-3 flex-row items-start justify-between gap-3">
                <div class="flex min-w-0 items-center gap-2">
                  <span class="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {{ index + 1 }}
                  </span>
                  <strong class="min-w-0 truncate text-foreground" :title="hit.documentName">
                    {{ hit.documentName }}
                  </strong>
                </div>
                <Badge :variant="matchReasonVariant(hit.matchReason)">
                  {{ matchReasonText(hit.matchReason) }}
                </Badge>
              </CardHeader>

              <CardContent class="flex min-h-0 flex-1 flex-col">
                <div class="mb-3 grid grid-cols-3 gap-2 text-xs">
                  <span class="rounded bg-muted px-2 py-1 text-muted-foreground">
                    综合 {{ formatScore(hit.finalScore) }}
                  </span>
                  <span class="rounded bg-muted px-2 py-1 text-muted-foreground">
                    语义 {{ formatScore(hit.vectorScore) }}
                  </span>
                  <span class="rounded bg-muted px-2 py-1 text-muted-foreground">
                    关键词 {{ formatScore(hit.keywordScore) }}
                  </span>
                </div>

                <p class="m-0 max-h-52 overflow-auto whitespace-pre-wrap text-sm leading-6 text-foreground">
                  {{ hit.content }}
                </p>
              </CardContent>

              <CardFooter class="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                分段 #{{ hit.position + 1 }} · {{ hit.charCount }} 字符
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>

      <form class="flex flex-col gap-3 border-t border-border bg-card p-4 lg:flex-row lg:items-end" @submit.prevent="runRetrieval">
        <label class="grid min-w-0 flex-1 gap-1.5">
          <span class="text-sm font-medium text-foreground">检索问题</span>
          <Input
            v-model="form.question"
            placeholder="输入一个需要在知识库中检索的问题"
            @keydown.enter.exact.prevent="runRetrieval"
          />
        </label>
        <label class="grid gap-1.5 lg:w-28">
          <span class="text-sm font-medium text-foreground">Top K</span>
          <Input
            v-model="form.topK"
            type="number"
            min="1"
            max="20"
          />
        </label>
        <Button :disabled="!canSearch" type="submit">
          {{ loading ? '检索中...' : '测试检索' }}
        </Button>
      </form>
    </Card>
  </div>
</template>
