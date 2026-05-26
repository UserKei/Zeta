<script setup lang="ts">
import { computed } from 'vue'
import type { ChatCitation } from '@/apis/chat'

const props = defineProps<{
  visible: boolean
  citations: ChatCitation[]
}>()

const emit = defineEmits<{
  'update:visible': [visible: boolean]
}>()

const dialogVisible = computed({
  get: () => props.visible,
  set: (visible: boolean) => emit('update:visible', visible),
})

const formatScore = (score: number | null) =>
  score === null ? '-' : `${(score * 100).toFixed(1)}%`
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    title="知识来源"
    width="min(760px, calc(100vw - 32px))"
    destroy-on-close
  >
    <div class="grid max-h-[70vh] gap-3 overflow-auto pr-1">
      <article
        v-for="(citation, index) in citations"
        :key="citation.id"
        class="grid gap-2 rounded-xl border border-(--zeta-line) bg-(--zeta-panel) p-4"
      >
        <header class="flex flex-wrap items-center justify-between gap-2">
          <strong>{{ index + 1 }}. {{ citation.documentName }}</strong>
          <div class="flex items-center gap-2">
            <el-tag effect="plain" size="small" type="info">
              分段 #{{ citation.chunkPosition + 1 }}
            </el-tag>
            <span class="text-xs text-(--zeta-muted)">
              综合分数 {{ formatScore(citation.score) }}
            </span>
          </div>
        </header>
        <p class="m-0 max-h-70 overflow-auto whitespace-pre-wrap rounded-lg bg-(--zeta-surface-soft) p-3 leading-7">
          {{ citation.quote || '暂无引用原文' }}
        </p>
      </article>
    </div>
  </el-dialog>
</template>
