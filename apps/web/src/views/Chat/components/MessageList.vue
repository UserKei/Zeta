<script setup lang="ts">
import { BotIcon, MessageCircleIcon } from '@lucide/vue'
import MarkdownPreview from '@/components/markdown/MarkdownPreview.vue'
import type { ChatCitation, ChatMessage } from '@/apis/chat'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const props = defineProps<{
  agentName: string
  openingMessage: string
  messages: ChatMessage[]
  streamingMessageId: string
}>()

defineEmits<{
  openCitations: [citations: ChatCitation[]]
  ask: [question: string]
}>()

const suggestedQuestions = [
  '我怎么开通 IT 账号？',
  'VPN 权限多久生效？',
  '采购合同审批需要哪些材料？',
]

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const getCitationDocuments = (citations: ChatCitation[]) => {
  const documents = new Map<string, string>()

  citations.forEach((citation) => {
    documents.set(citation.documentId, citation.documentName)
  })

  return [...documents.entries()].map(([id, name]) => ({
    id,
    name,
  }))
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-auto bg-card px-4 pb-56 pt-6 md:px-8">
    <article
      v-if="messages.length === 0"
      class="mx-auto flex min-h-full max-w-[750px] flex-col justify-center py-8"
    >
      <div class="grid justify-items-center gap-4 text-center">
        <div class="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
          <MessageCircleIcon />
        </div>
        <div class="grid gap-2.5">
          <h2 class="text-3xl font-bold text-foreground">
            {{ agentName || '开始一次问答' }}
          </h2>
          <p class="max-w-xl text-sm leading-7 text-muted-foreground">
            {{ openingMessage || '向 Agent 提问，它会基于绑定知识库回答并给出来源。' }}
          </p>
        </div>

        <div class="mt-1 flex flex-wrap justify-center gap-2">
          <Button
            v-for="question in suggestedQuestions"
            :key="question"
            type="button"
            variant="outline"
            size="sm"
            class="rounded-full"
            @click="$emit('ask', question)"
          >
            {{ question }}
          </Button>
        </div>
      </div>
    </article>

    <div v-else class="mx-auto grid max-w-[750px] gap-5">
      <div
        v-for="message in messages"
        :key="message.id"
        :class="['flex w-full gap-3', message.role === 'USER' ? 'justify-end' : 'justify-start']"
      >
        <div
          v-if="message.role !== 'USER'"
          class="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
        >
          <BotIcon />
        </div>

        <article
          v-if="message.role === 'USER'"
          class="max-w-[620px] rounded-2xl rounded-br-md bg-primary px-4 py-3.5 text-primary-foreground shadow-sm"
        >
          <p class="whitespace-pre-wrap break-words text-sm leading-7">
            {{ message.content }}
          </p>
          <p class="mt-2 text-right text-xs text-primary-foreground/65">
            {{ formatTime(message.createdAt) }}
          </p>
        </article>

        <article v-else class="min-w-0 flex-1 py-1">
          <header class="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <strong class="text-foreground">{{ props.agentName || 'Agent' }}</strong>
            <span>{{ formatTime(message.createdAt) }}</span>
          </header>

          <MarkdownPreview
            v-if="message.content"
            :editor-id="`chat-message-${message.id}`"
            :model-value="message.content"
            class="zeta-chat-md-preview"
          />
          <p
            v-else-if="message.id === streamingMessageId"
            class="flex items-center gap-2 leading-7 text-muted-foreground"
          >
            <span class="inline-flex gap-1">
              <span class="size-1.5 animate-pulse rounded-full bg-primary"></span>
              <span
                class="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:120ms]"
              ></span>
              <span
                class="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:240ms]"
              ></span>
            </span>
            正在生成回答
          </p>

          <Card
            v-if="message.citations.length > 0"
            size="sm"
            class="mt-3 gap-2 border-border bg-muted/40 p-3 shadow-none"
          >
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span class="text-muted-foreground">知识来源</span>
              <span class="h-3.5 w-px bg-border"></span>
              <Button
                type="button"
                variant="link"
                size="sm"
                class="h-auto p-0 text-sm"
                @click="$emit('openCitations', message.citations)"
              >
                引用分段 {{ message.citations.length }}
              </Button>
            </div>
            <div class="flex flex-wrap gap-2">
              <Badge
                v-for="document in getCitationDocuments(message.citations)"
                :key="document.id"
                variant="outline"
              >
                {{ document.name }}
              </Badge>
            </div>
          </Card>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.zeta-chat-md-preview {
  background: transparent;
}

.zeta-chat-md-preview :deep(.md-editor-preview-wrapper) {
  padding: 0;
}

.zeta-chat-md-preview :deep(.md-editor-preview) {
  color: var(--foreground);
  font-size: 15px;
  line-height: 1.85;
}
</style>
