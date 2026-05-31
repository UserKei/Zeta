<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DataAnalysis, Document, Link, Timer } from '@element-plus/icons-vue'
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
    icon: DataAnalysis,
  },
  {
    label: '被引用文档',
    value: usage.value?.citedDocumentCount ?? 0,
    icon: Document,
  },
  {
    label: '被引用分段',
    value: usage.value?.citedChunkCount ?? 0,
    icon: Link,
  },
  {
    label: '最近引用',
    value: usage.value?.lastCitedAt ? formatTime(usage.value.lastCitedAt) : '-',
    icon: Timer,
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
        <h1 class="m-0 text-2xl font-semibold text-(--zeta-ink)">知识热度</h1>
        <p class="m-0 mt-1.5 text-sm text-(--zeta-muted)">
          只统计 Agent 回答中真实产生的引用，不包含检索测试。
        </p>
      </div>
      <el-radio-group v-model="range">
        <el-radio-button
          v-for="option in rangeOptions"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </el-radio-button>
      </el-radio-group>
    </header>

    <section v-loading="loading" class="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4">
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article
          v-for="card in summaryCards"
          :key="card.label"
          class="flex items-center gap-3 rounded-lg border border-(--zeta-line) bg-(--zeta-panel) p-4"
        >
          <el-avatar class="avatar-light" :icon="card.icon" />
          <div>
            <p class="m-0 text-sm text-(--zeta-muted)">{{ card.label }}</p>
            <strong class="mt-1 block text-2xl text-(--zeta-ink)">{{ card.value }}</strong>
          </div>
        </article>
      </div>

      <div class="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <el-card
          :body-style="{ padding: '0', height: '100%', display: 'flex', flexDirection: 'column' }"
          shadow="never"
          class="min-h-0 overflow-hidden"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <span class="font-semibold text-(--zeta-ink)">热门文档</span>
              <span class="text-sm text-(--zeta-muted)">
                {{ usage?.topDocuments.length ?? 0 }} 个文档
              </span>
            </div>
          </template>

          <div class="min-h-0 flex-1 overflow-auto">
            <el-empty
              v-if="!usage || usage.topDocuments.length === 0"
              description="暂无引用数据"
            />
            <el-table v-else :data="usage.topDocuments" height="100%">
              <el-table-column label="文档" min-width="220">
                <template #default="{ row }">
                  <div class="grid gap-1">
                    <strong class="truncate text-(--zeta-ink)" :title="row.documentName">
                      {{ row.documentName }}
                    </strong>
                    <small class="text-(--zeta-muted)">{{ sourceText(row.sourceType) }}</small>
                  </div>
                </template>
              </el-table-column>
              <el-table-column align="center" label="引用" width="90">
                <template #default="{ row }">
                  <el-tag effect="light" type="primary">{{ row.citationCount }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column align="center" label="分段" width="90" prop="citedChunkCount" />
              <el-table-column label="最近引用" width="130">
                <template #default="{ row }">
                  {{ formatTime(row.lastCitedAt) }}
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-card>

        <el-card
          :body-style="{ padding: '0', height: '100%', display: 'flex', flexDirection: 'column' }"
          shadow="never"
          class="min-h-0 overflow-hidden"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <span class="font-semibold text-(--zeta-ink)">热门分段</span>
              <span class="text-sm text-(--zeta-muted)">
                {{ usage?.topChunks.length ?? 0 }} 个分段
              </span>
            </div>
          </template>

          <div class="min-h-0 flex-1 overflow-auto p-4">
            <el-empty
              v-if="!usage || usage.topChunks.length === 0"
              description="暂无引用数据"
            />
            <div v-else class="grid gap-3">
              <article
                v-for="chunk in usage.topChunks"
                :key="chunk.chunkId"
                class="rounded-lg border border-(--zeta-line-soft) bg-(--zeta-surface-tint) p-4"
              >
                <header class="mb-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                  <div class="min-w-0">
                    <strong class="block truncate text-(--zeta-ink)" :title="chunk.title || '-'">
                      {{ chunk.title || '未命名分段' }}
                    </strong>
                    <p class="m-0 mt-1 text-xs text-(--zeta-muted)">
                      {{ chunk.documentName }} · 分段 #{{ chunk.chunkPosition + 1 }}
                    </p>
                  </div>
                  <el-tag effect="light" type="success">
                    引用 {{ chunk.citationCount }}
                  </el-tag>
                </header>

                <p class="m-0 line-clamp-3 text-sm leading-6 text-(--zeta-content)">
                  {{ chunk.preview || '暂无内容摘要' }}
                </p>

                <footer class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-(--zeta-muted)">
                  <span>最近引用 {{ formatTime(chunk.lastCitedAt) }}</span>
                  <el-button link type="primary" @click="goChunk(chunk.documentId, chunk.chunkId)">
                    查看分段
                  </el-button>
                </footer>
              </article>
            </div>
          </div>
        </el-card>
      </div>
    </section>
  </div>
</template>
