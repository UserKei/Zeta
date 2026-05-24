<script setup lang="ts">
import { ChatDotRound } from '@element-plus/icons-vue'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import type { ChatCitation, ChatMessage } from '@/apis/chat'

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
  <div class="min-h-0 overflow-auto bg-white px-4 pb-56 pt-6 md:px-8">
    <article v-if="messages.length === 0" class="mx-auto flex min-h-full max-w-[750px] flex-col justify-center py-8">
      <div class="grid justify-items-center gap-4 text-center">
        <div class="grid size-12 place-items-center rounded-2xl bg-(--zeta-blue-soft) text-(--zeta-blue)">
          <el-icon size="24"><ChatDotRound /></el-icon>
        </div>
        <div class="grid gap-2.5">
          <h2 class="m-0 text-3xl font-extrabold text-(--zeta-ink)">
            {{ agentName || '开始一次问答' }}
          </h2>
          <p class="m-0 max-w-xl text-sm leading-7 text-(--zeta-muted)">
            {{ openingMessage || '向 Agent 提问，它会基于绑定知识库回答并给出来源。' }}
          </p>
        </div>

        <div class="mt-1 flex flex-wrap justify-center gap-2">
          <button
            v-for="question in suggestedQuestions"
            :key="question"
            class="rounded-full border border-(--zeta-line) bg-(--zeta-surface-soft) px-4 py-2 text-sm text-(--zeta-content) transition hover:border-(--zeta-blue-line) hover:bg-white hover:text-(--zeta-blue)"
            type="button"
            @click="$emit('ask', question)"
          >
            {{ question }}
          </button>
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
          class="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-(--zeta-blue-soft) text-xs font-bold text-(--zeta-blue)"
        >
          AI
        </div>

        <article
          v-if="message.role === 'USER'"
          class="max-w-[620px] rounded-2xl rounded-br-md bg-(--zeta-blue) px-4 py-3.5 text-white shadow-sm"
        >
          <p class="m-0 whitespace-pre-wrap break-words text-sm leading-7">
            {{ message.content }}
          </p>
          <p class="m-0 mt-2 text-right text-xs text-white/65">
            {{ formatTime(message.createdAt) }}
          </p>
        </article>

        <article v-else class="min-w-0 flex-1 py-1">
          <header class="mb-2 flex flex-wrap items-center gap-2 text-xs text-(--zeta-muted)">
            <strong class="text-(--zeta-content)">{{ props.agentName || 'Agent' }}</strong>
            <span>{{ formatTime(message.createdAt) }}</span>
          </header>

          <MdPreview
            v-if="message.content"
            :editor-id="`chat-message-${message.id}`"
            :model-value="message.content"
            class="zeta-chat-md-preview"
          />
          <p v-else-if="message.id === streamingMessageId" class="m-0 flex items-center gap-2 text-(--zeta-muted) leading-7">
            <span class="inline-flex gap-1">
              <span class="size-1.5 animate-pulse rounded-full bg-(--zeta-blue)"></span>
              <span class="size-1.5 animate-pulse rounded-full bg-(--zeta-blue) [animation-delay:120ms]"></span>
              <span class="size-1.5 animate-pulse rounded-full bg-(--zeta-blue) [animation-delay:240ms]"></span>
            </span>
            正在生成回答
          </p>

          <div v-if="message.citations.length > 0" class="mt-3 grid gap-2 rounded-xl bg-(--zeta-surface-soft) p-3">
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span class="text-(--zeta-muted)">知识来源</span>
              <span class="h-3.5 w-px bg-(--zeta-line)"></span>
              <button
                class="border-0 bg-transparent p-0 text-sm font-semibold text-(--zeta-blue) transition hover:text-(--zeta-blue-hover)"
                type="button"
                @click="$emit('openCitations', message.citations)"
              >
                引用分段 {{ message.citations.length }}
              </button>
            </div>
            <div class="flex flex-wrap gap-2">
              <el-tag
                v-for="document in getCitationDocuments(message.citations)"
                :key="document.id"
                effect="plain"
                type="info"
              >
                {{ document.name }}
              </el-tag>
            </div>
          </div>
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
  color: var(--zeta-content);
  font-size: 15px;
  line-height: 1.85;
}
</style>
