<script setup lang="ts">
import { computed } from 'vue'
import { ExternalLinkIcon, EyeIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { ChatImproveRecord, ChatMessage, ChatSession } from '@/apis/chat'

const props = defineProps<{
  open: boolean
  selectedSession: ChatSession | null | undefined
  messages: ChatMessage[]
  messageLoading: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'open-mark': [message: ChatMessage]
  'view-improve': [record: ChatImproveRecord]
  'save-improve': [message: ChatMessage, index: number]
}>()

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})

const latestImproveRecord = (message: ChatMessage) => message.improveRecords.at(-1) ?? null

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
</script>

<template>
  <Sheet v-model:open="openModel">
    <SheetContent
      side="right"
      class="w-[calc(100vw-1rem)] p-0 sm:max-w-none md:w-[60vw] md:min-w-180"
    >
      <SheetHeader class="border-b border-border px-5 py-4">
        <SheetTitle>对话详情</SheetTitle>
        <SheetDescription>
          {{ selectedSession?.title || '新会话' }}
        </SheetDescription>
      </SheetHeader>

      <div class="min-h-0 flex-1 overflow-auto p-5">
        <div v-if="messageLoading" class="grid gap-4">
          <Skeleton v-for="index in 3" :key="index" class="h-34 w-full" />
        </div>

        <div
          v-else-if="messages.length === 0"
          class="grid min-h-40 place-items-center text-sm text-muted-foreground"
        >
          暂无消息
        </div>

        <div v-else class="grid gap-4">
          <div
            v-for="(message, index) in messages"
            :key="message.id"
            :class="cn('flex w-full', message.role === 'USER' ? 'justify-end' : 'justify-start')"
          >
            <article
              :class="
                cn(
                  'grid max-w-[min(680px,100%)] gap-3 rounded-2xl px-4 py-3.5 text-sm leading-7 shadow-sm',
                  message.role === 'USER'
                    ? 'rounded-br-md bg-primary text-primary-foreground'
                    : 'rounded-bl-md border border-border bg-muted/50 text-foreground',
                )
              "
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex flex-wrap items-center gap-2">
                  <Badge :variant="message.role === 'ASSISTANT' ? 'default' : 'secondary'">
                    {{ message.role === 'ASSISTANT' ? 'AI 回答' : '用户问题' }}
                  </Badge>
                  <span
                    :class="
                      cn(
                        'text-xs',
                        message.role === 'USER'
                          ? 'text-primary-foreground/70'
                          : 'text-muted-foreground',
                      )
                    "
                  >
                    {{ formatTime(message.createdAt) }}
                  </span>
                  <Badge
                    v-if="message.improveRecords.length > 0"
                    :variant="message.role === 'USER' ? 'secondary' : 'outline'"
                  >
                    已标注 {{ message.improveRecords.length }}
                  </Badge>
                </div>

                <div v-if="message.role === 'ASSISTANT'" class="flex flex-wrap items-center gap-2">
                  <Button
                    v-if="message.improveRecords.length > 0"
                    type="button"
                    variant="outline"
                    size="sm"
                    @click="emit('open-mark', message)"
                  >
                    <EyeIcon data-icon="inline-start" />
                    改进标注
                  </Button>
                  <Button
                    v-if="latestImproveRecord(message)"
                    type="button"
                    variant="outline"
                    size="sm"
                    @click="emit('view-improve', latestImproveRecord(message)!)"
                  >
                    <ExternalLinkIcon data-icon="inline-start" />
                    查看分段
                  </Button>
                  <Button type="button" size="sm" @click="emit('save-improve', message, index)">
                    保存至文档
                  </Button>
                </div>
              </div>

              <p class="whitespace-pre-wrap break-words">
                {{ message.content }}
              </p>

              <Card
                v-if="latestImproveRecord(message)"
                class="flex-row flex-wrap items-center gap-2 border-border bg-card/80 px-3 py-2 text-sm shadow-none"
              >
                <Badge variant="outline">已标注 {{ message.improveRecords.length }}</Badge>
                <span class="font-medium">{{ latestImproveRecord(message)!.documentName }}</span>
                <span class="text-muted-foreground">
                  分段 #{{ latestImproveRecord(message)!.chunkPosition + 1 }}
                </span>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  class="h-auto p-0"
                  @click="emit('view-improve', latestImproveRecord(message)!)"
                >
                  查看分段
                </Button>
              </Card>
            </article>
          </div>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
