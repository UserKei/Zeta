<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowLeft, Plus, Search } from '@element-plus/icons-vue'
import type { Agent } from '@/apis/agents'
import type { ChatSession } from '@/apis/chat'

const props = defineProps<{
  agent: Agent | null
  sessions: ChatSession[]
  currentSessionId: string | null
  loading: boolean
  sending: boolean
}>()

defineEmits<{
  back: []
  newSession: []
  selectSession: [session: ChatSession]
}>()

const keyword = ref('')

const filteredSessions = computed(() => {
  const search = keyword.value.trim().toLowerCase()

  if (!search) {
    return props.sessions
  }

  return props.sessions.filter((session) =>
    (session.title || '未命名会话').toLowerCase().includes(search),
  )
})

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
</script>

<template>
  <aside
    class="grid min-h-96 overflow-hidden rounded-[24px] border border-(--zeta-line) bg-white/90 backdrop-blur xl:h-full xl:min-h-0 xl:grid-rows-[auto_minmax(0,1fr)]"
  >
    <header class="grid gap-4 border-b border-(--zeta-line-soft) p-4">
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2">
          <button
            class="grid size-8 shrink-0 place-items-center rounded-full border border-(--zeta-line) bg-white text-(--zeta-muted) transition hover:border-(--zeta-blue-line) hover:text-(--zeta-blue)"
            type="button"
            aria-label="返回 Agent"
            @click="$emit('back')"
          >
            <el-icon><ArrowLeft /></el-icon>
          </button>
          <strong class="truncate text-lg font-extrabold text-(--zeta-ink)">Zeta</strong>
        </div>
        <button
          class="grid size-9 shrink-0 place-items-center rounded-full border-0 bg-(--zeta-blue) text-white shadow-sm transition hover:bg-(--zeta-blue-hover) disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          :disabled="sending"
          aria-label="新会话"
          @click="$emit('newSession')"
        >
          <el-icon><Plus /></el-icon>
        </button>
      </div>

      <label
        class="flex h-10 items-center gap-2 rounded-xl bg-(--zeta-surface-soft) px-3 text-(--zeta-muted) transition focus-within:ring-2 focus-within:ring-(--zeta-blue-line)"
      >
        <el-icon><Search /></el-icon>
        <input
          v-model="keyword"
          class="min-w-0 flex-1 border-0 bg-transparent text-sm text-(--zeta-ink) outline-none placeholder:text-(--zeta-subtle)"
          placeholder="搜索会话"
          type="search"
        />
      </label>

      <div class="rounded-2xl bg-(--zeta-surface-tint) p-3">
        <p class="m-0 text-xs font-semibold uppercase text-(--zeta-blue)">Current Agent</p>
        <h1 class="m-0 mt-1 truncate text-base font-bold text-(--zeta-ink)">
          {{ agent?.name || 'Agent 聊天' }}
        </h1>
        <p class="m-0 mt-1 line-clamp-2 text-xs leading-5 text-(--zeta-muted)">
          {{ agent?.description || agent?.openingMessage || '基于知识库回答问题。' }}
        </p>
      </div>
    </header>

    <section class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <div class="flex items-center justify-between px-4 py-3">
        <h2 class="m-0 text-sm font-bold text-(--zeta-ink)">Threads</h2>
        <span class="rounded-full bg-(--zeta-info-soft) px-2.5 py-1 text-xs text-(--zeta-muted)">
          {{ filteredSessions.length }}
        </span>
      </div>

      <div class="min-h-0 overflow-auto px-2 pb-3">
        <div v-if="loading" class="grid min-h-24 place-items-center text-sm text-(--zeta-muted)">
          会话加载中
        </div>
        <div v-else-if="sessions.length === 0" class="grid min-h-24 place-items-center text-sm text-(--zeta-muted)">
          还没有会话
        </div>
        <div v-else-if="filteredSessions.length === 0" class="grid min-h-24 place-items-center text-sm text-(--zeta-muted)">
          没有匹配会话
        </div>

        <button
          v-for="session in filteredSessions"
          :key="session.id"
          :class="[
            'group grid w-full gap-1 rounded-xl border px-3.5 py-3 text-left transition',
            session.id === currentSessionId
              ? 'border-(--zeta-blue-line) bg-(--zeta-blue-soft)'
              : 'border-transparent bg-transparent opacity-85 hover:border-(--zeta-line-soft) hover:bg-(--zeta-surface-soft) hover:opacity-100',
          ]"
          type="button"
          @click="$emit('selectSession', session)"
        >
          <strong class="line-clamp-2 text-sm font-semibold leading-5 text-(--zeta-ink)">
            {{ session.title || '未命名会话' }}
          </strong>
          <span class="text-xs text-(--zeta-muted)">
            {{ formatTime(session.updatedAt) }}
          </span>
        </button>
      </div>
    </section>
  </aside>
</template>
