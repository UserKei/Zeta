<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Close, Top } from '@element-plus/icons-vue'

const props = defineProps<{
  message: string
  topK: number
  sending: boolean
}>()

const emit = defineEmits<{
  'update:message': [message: string]
  'update:topK': [topK: number]
  submit: []
  stop: []
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)

const messageValue = computed({
  get: () => props.message,
  set: (value: string) => emit('update:message', value),
})

const topKValue = computed({
  get: () => props.topK,
  set: (value: number) => emit('update:topK', value),
})

const resizeTextarea = () => {
  const textarea = textareaRef.value

  if (!textarea) {
    return
  }

  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`
}

const handleInput = (event: Event) => {
  messageValue.value = (event.target as HTMLTextAreaElement).value
  resizeTextarea()
}

const handleTopKInput = (event: Event) => {
  const value = Number((event.target as HTMLInputElement).value)

  if (Number.isInteger(value)) {
    topKValue.value = Math.min(Math.max(value, 1), 20)
  }
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Enter' || event.shiftKey) {
    return
  }

  event.preventDefault()

  if (!props.sending && props.message.trim()) {
    emit('submit')
  }
}

watch(
  () => props.message,
  async () => {
    await nextTick()
    resizeTextarea()
  },
)
</script>

<template>
  <footer
    class="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-5 pt-10 md:px-8"
  >
    <div class="pointer-events-auto mx-auto max-w-[750px]">
      <div class="rounded-[28px] bg-(--zeta-surface-soft) px-5 py-4 shadow-[0_18px_54px_rgba(24,40,72,0.12)] ring-1 ring-(--zeta-line-soft)">
        <textarea
          ref="textareaRef"
          class="max-h-45 min-h-13 w-full resize-none border-0 bg-transparent py-2 text-sm leading-7 text-(--zeta-ink) outline-none placeholder:text-(--zeta-subtle)"
          :disabled="sending"
          placeholder="输入问题"
          :value="messageValue"
          rows="1"
          @input="handleInput"
          @keydown="handleKeydown"
        ></textarea>

        <div class="flex flex-wrap items-center justify-between gap-3 pt-3">
          <label
            class="inline-flex h-9 items-center gap-2 rounded-full bg-white px-3 text-xs font-semibold text-(--zeta-muted) ring-1 ring-(--zeta-line-soft)"
          >
            <span>Top K</span>
            <input
              class="h-7 w-9 border-0 bg-transparent text-center text-sm font-bold text-(--zeta-ink) outline-none"
              :value="topKValue"
              max="20"
              min="1"
              type="number"
              @input="handleTopKInput"
            />
          </label>

          <button
            v-if="sending"
            class="grid size-10 place-items-center rounded-full border border-(--zeta-danger-line) bg-(--zeta-danger-soft) text-(--zeta-danger) transition hover:border-(--zeta-danger) disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            aria-label="停止生成"
            @click="$emit('stop')"
          >
            <el-icon><Close /></el-icon>
          </button>
          <button
            v-else
            class="grid size-10 place-items-center rounded-full border-0 bg-(--zeta-blue) text-white shadow-sm transition hover:bg-(--zeta-blue-hover) disabled:cursor-not-allowed disabled:bg-(--zeta-subtle)"
            type="button"
            :disabled="!message.trim()"
            aria-label="发送"
            @click="$emit('submit')"
          >
            <el-icon><Top /></el-icon>
          </button>
        </div>
      </div>
    </div>
  </footer>
</template>
