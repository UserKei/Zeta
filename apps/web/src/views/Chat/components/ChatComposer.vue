<script setup lang="ts">
import { computed } from 'vue'
import { CircleStopIcon, SendIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const props = defineProps<{
  message: string
  topK: number
  sending: boolean
  disabled?: boolean
  disabledReason?: string
}>()

const emit = defineEmits<{
  'update:message': [message: string]
  'update:topK': [topK: number]
  submit: []
  stop: []
}>()

const messageValue = computed({
  get: () => props.message,
  set: (value: string) => emit('update:message', value),
})

const topKValue = computed({
  get: () => props.topK,
  set: (value: number) => emit('update:topK', value),
})

const handleTopKValue = (value: string | number) => {
  const nextValue = Number(value)

  if (Number.isInteger(nextValue)) {
    topKValue.value = Math.min(Math.max(nextValue, 1), 20)
  }
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Enter' || event.shiftKey) {
    return
  }

  event.preventDefault()

  if (!props.sending && !props.disabled && props.message.trim()) {
    emit('submit')
  }
}
</script>

<template>
  <footer
    class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-card via-card/95 to-transparent px-4 pb-5 pt-10 md:px-8"
  >
    <div class="pointer-events-auto mx-auto max-w-[750px]">
      <div class="rounded-xl border border-border bg-card p-4 shadow-lg">
        <Textarea
          v-model="messageValue"
          class="max-h-45 min-h-13 resize-none border-0 bg-transparent px-0 py-2 text-sm leading-7 shadow-none focus-visible:ring-0"
          :disabled="sending || disabled"
          placeholder="输入问题"
          rows="1"
          @keydown="handleKeydown"
        />

        <p v-if="disabled && disabledReason" class="text-xs text-destructive">
          {{ disabledReason }}
        </p>

        <div class="flex flex-wrap items-center justify-between gap-3 pt-3">
          <label
            class="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium text-muted-foreground"
          >
            <span>Top K</span>
            <Input
              class="h-7 w-12 border-0 px-1 text-center text-sm font-semibold shadow-none focus-visible:ring-0"
              :model-value="topKValue"
              max="20"
              min="1"
              type="number"
              @update:model-value="handleTopKValue"
            />
          </label>

          <Button
            v-if="sending"
            type="button"
            variant="destructive"
            size="icon-lg"
            aria-label="停止生成"
            @click="$emit('stop')"
          >
            <CircleStopIcon />
          </Button>
          <Button
            v-else
            type="button"
            size="icon-lg"
            :disabled="disabled || !message.trim()"
            aria-label="发送"
            @click="$emit('submit')"
          >
            <SendIcon />
          </Button>
        </div>
      </div>
    </div>
  </footer>
</template>
