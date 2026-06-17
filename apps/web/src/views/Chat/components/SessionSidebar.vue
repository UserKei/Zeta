<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowLeftIcon, PlusIcon } from '@lucide/vue'
import type { Agent } from '@/apis/agents'
import type { ChatSession } from '@/apis/chat'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'

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
  <Sidebar collapsible="offcanvas" class="border-r border-sidebar-border">
    <SidebarHeader class="gap-4 border-b border-sidebar-border p-4">
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="返回 Agent"
            @click="$emit('back')"
          >
            <ArrowLeftIcon />
          </Button>
          <strong class="truncate text-lg font-semibold text-sidebar-foreground">Zeta</strong>
        </div>
        <Button
          type="button"
          size="icon"
          :disabled="sending"
          aria-label="新会话"
          @click="$emit('newSession')"
        >
          <PlusIcon />
        </Button>
      </div>

      <SidebarInput v-model="keyword" placeholder="搜索会话" type="search" />
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup>
        <div class="flex items-center justify-between px-2">
          <SidebarGroupLabel>会话</SidebarGroupLabel>
          <Badge variant="secondary">{{ filteredSessions.length }}</Badge>
        </div>

        <SidebarGroupContent>
          <div
            v-if="loading"
            class="grid min-h-24 place-items-center px-2 text-sm text-muted-foreground"
          >
            会话加载中
          </div>
          <div
            v-else-if="sessions.length === 0"
            class="grid min-h-24 place-items-center px-2 text-sm text-muted-foreground"
          >
            还没有会话
          </div>
          <div
            v-else-if="filteredSessions.length === 0"
            class="grid min-h-24 place-items-center px-2 text-sm text-muted-foreground"
          >
            没有匹配会话
          </div>

          <SidebarMenu v-else>
            <SidebarMenuItem v-for="session in filteredSessions" :key="session.id">
              <SidebarMenuButton
                type="button"
                class="h-auto items-start py-3"
                :is-active="session.id === currentSessionId"
                @click="$emit('selectSession', session)"
              >
                <div class="grid min-w-0 gap-1">
                  <strong class="line-clamp-2 text-sm font-medium leading-5">
                    {{ session.title || '未命名会话' }}
                  </strong>
                  <span class="text-xs text-muted-foreground">
                    {{ formatTime(session.updatedAt) }}
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>

    <SidebarSeparator />
  </Sidebar>
</template>
