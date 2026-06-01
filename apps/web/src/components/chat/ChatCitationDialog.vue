<script setup lang="ts">
import { computed } from 'vue'
import type { ChatCitation } from '@/apis/chat'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

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
  <Dialog v-model:open="dialogVisible">
    <DialogContent class="sm:max-w-190">
      <DialogHeader>
        <DialogTitle>知识来源</DialogTitle>
        <DialogDescription>查看本次回答引用的知识库分段和综合分数。</DialogDescription>
      </DialogHeader>

      <div class="grid max-h-[70vh] gap-3 overflow-auto pr-1">
        <Card
          v-for="(citation, index) in citations"
          :key="citation.id"
          class="gap-2 border-border p-4 shadow-none"
        >
          <header class="flex flex-wrap items-center justify-between gap-2">
            <strong>{{ index + 1 }}. {{ citation.documentName }}</strong>
            <div class="flex items-center gap-2">
              <Badge variant="outline"> 分段 #{{ citation.chunkPosition + 1 }} </Badge>
              <span class="text-xs text-muted-foreground">
                综合分数 {{ formatScore(citation.score) }}
              </span>
            </div>
          </header>
          <p class="max-h-70 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 leading-7">
            {{ citation.quote || '暂无引用原文' }}
          </p>
        </Card>
      </div>
    </DialogContent>
  </Dialog>
</template>
