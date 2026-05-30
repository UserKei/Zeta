<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'
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

const canSearch = computed(() => form.question.trim().length > 0 && !loading.value)

const runRetrieval = async () => {
  if (!canSearch.value) {
    return
  }

  loading.value = true

  try {
    result.value = await testKnowledgeBaseRetrieval(knowledgeBaseId.value, {
      question: form.question,
      topK: form.topK,
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

const matchReasonType = (reason: RetrievalHit['matchReason']) =>
  ({
    VECTOR: 'info',
    KEYWORD: 'warning',
    HYBRID: 'success',
  })[reason]
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col p-4 lg:p-6">
    <header class="mb-4">
      <h1 class="m-0 text-2xl font-semibold text-(--zeta-ink)">检索测试</h1>
      <p class="m-0 mt-1.5 text-sm text-(--zeta-muted)">
        输入问题，查看知识库分段的命中原因和综合评分。
      </p>
    </header>

    <section class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-(--zeta-line) bg-(--zeta-panel)">
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div v-if="!result" class="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <el-empty description="命中分段会显示在这里" />
        </div>

        <div v-else-if="result.hits.length === 0" class="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <el-empty description="没有命中的分段" />
        </div>

        <div v-else class="min-h-0 flex-1 overflow-auto p-4">
          <div class="mb-4 flex min-w-0 items-center gap-3 rounded-lg bg-(--zeta-surface) px-4 py-3">
            <el-avatar :icon="Search" />
            <div class="min-w-0">
              <p class="m-0 truncate font-semibold text-(--zeta-ink)" :title="result.question">
                {{ result.question }}
              </p>
              <p class="m-0 mt-1 text-sm text-(--zeta-muted)">
                返回 Top {{ result.topK }}，实际命中 {{ result.hits.length }} 个分段
              </p>
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <article
              v-for="(hit, index) in result.hits"
              :key="hit.chunkId"
              class="flex min-h-0 flex-col rounded-lg border border-(--zeta-line-soft) bg-(--zeta-surface-tint) p-4"
            >
              <header class="mb-3 flex items-start justify-between gap-3">
                <div class="flex min-w-0 items-center gap-2">
                  <el-avatar class="avatar-light" :size="24">{{ index + 1 }}</el-avatar>
                  <strong class="min-w-0 truncate text-(--zeta-ink)" :title="hit.documentName">
                    {{ hit.documentName }}
                  </strong>
                </div>
                <el-tag effect="light" :type="matchReasonType(hit.matchReason)">
                  {{ matchReasonText(hit.matchReason) }}
                </el-tag>
              </header>

              <div class="mb-3 grid grid-cols-3 gap-2 text-xs">
                <span class="rounded bg-(--zeta-panel) px-2 py-1 text-(--zeta-muted)">
                  综合 {{ formatScore(hit.finalScore) }}
                </span>
                <span class="rounded bg-(--zeta-panel) px-2 py-1 text-(--zeta-muted)">
                  语义 {{ formatScore(hit.vectorScore) }}
                </span>
                <span class="rounded bg-(--zeta-panel) px-2 py-1 text-(--zeta-muted)">
                  关键词 {{ formatScore(hit.keywordScore) }}
                </span>
              </div>

              <p class="m-0 max-h-52 overflow-auto whitespace-pre-wrap text-sm leading-6 text-(--zeta-content)">
                {{ hit.content }}
              </p>

              <footer class="mt-3 border-t border-(--zeta-line-soft) pt-3 text-xs text-(--zeta-muted)">
                分段 #{{ hit.position + 1 }} · {{ hit.charCount }} 字符
              </footer>
            </article>
          </div>
        </div>
      </div>

      <div class="border-t border-(--zeta-line-soft) bg-(--zeta-panel) p-4">
        <el-form class="flex flex-col gap-3 lg:flex-row lg:items-end" label-position="top" @submit.prevent="runRetrieval">
          <el-form-item class="min-w-0 flex-1" label="检索问题">
            <el-input
              v-model="form.question"
              :autosize="{ minRows: 1, maxRows: 3 }"
              placeholder="输入一个需要在知识库中检索的问题"
              type="textarea"
              @keydown.enter.exact.prevent="runRetrieval"
            />
          </el-form-item>
          <el-form-item label="Top K">
            <el-input-number
              v-model="form.topK"
              :max="20"
              :min="1"
              controls-position="right"
            />
          </el-form-item>
          <el-button :disabled="!canSearch" :loading="loading" native-type="submit" type="primary">
            测试检索
          </el-button>
        </el-form>
      </div>
    </section>
  </div>
</template>
