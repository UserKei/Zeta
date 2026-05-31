<script setup lang="ts">
import type { RouteRecordName } from 'vue-router'
import { computed, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { ArrowLeftIcon, FolderOpenIcon } from '@lucide/vue'

import { getAgent } from '@/apis/agents'
import { getKnowledgeBase } from '@/apis/knowledge-bases'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from '@/components/ui/sidebar'

type WorkspaceResourceType = 'knowledgeBase' | 'agent'

defineOptions({
  name: 'WorkspaceLayout',
})

const route = useRoute()
const router = useRouter()

const workspaceRoute = computed(() =>
  route.matched.find((record) => record.children?.some((child) => child.meta?.workspaceMenu)),
)

const fallbackWorkspaceTitle = computed(() =>
  String(workspaceRoute.value?.meta?.workspaceTitle || '工作区'),
)
const workspaceSubtitle = computed(() =>
  String(workspaceRoute.value?.meta?.workspaceSubtitle || ''),
)
const backRouteName = computed(
  () => workspaceRoute.value?.meta?.workspaceBackRoute as RouteRecordName | undefined,
)

const workspaceResourceType = computed<WorkspaceResourceType | ''>(() => {
  const value = workspaceRoute.value?.meta?.workspaceResourceType
  return value === 'knowledgeBase' || value === 'agent' ? value : ''
})

const workspaceResourceIdParam = computed(() => {
  const value = workspaceRoute.value?.meta?.workspaceResourceIdParam
  return typeof value === 'string' ? value : ''
})

const workspaceResourceId = computed(() => {
  const param = workspaceResourceIdParam.value
  if (!param) return ''

  const value = route.params[param]
  return Array.isArray(value) ? value[0] || '' : value || ''
})

const workspaceLabel = computed(() => {
  const value = workspaceRoute.value?.meta?.workspaceLabel
  if (typeof value === 'string' && value.trim()) return value
  if (workspaceResourceType.value === 'agent') return 'Agent 工作区'
  if (workspaceResourceType.value === 'knowledgeBase') return '知识库工作区'
  return '工作区'
})

const resourceTitle = ref('')
let resourceRequestId = 0

watch(
  [workspaceResourceType, workspaceResourceId],
  async ([type, id]) => {
    const requestId = ++resourceRequestId
    resourceTitle.value = ''

    if (!type || !id) return

    try {
      const resource = type === 'knowledgeBase' ? await getKnowledgeBase(id) : await getAgent(id)
      if (requestId === resourceRequestId) {
        resourceTitle.value = resource.name
      }
    } catch {
      if (requestId === resourceRequestId) {
        resourceTitle.value = ''
      }
    }
  },
  { immediate: true },
)

const workspaceTitle = computed(() => resourceTitle.value || fallbackWorkspaceTitle.value)

const workspaceMenus = computed(() => {
  const parent = workspaceRoute.value
  if (!parent) return []

  return parent.children
    .filter((child) => child.meta?.workspaceMenu)
    .map((child) => ({
      name: child.name as RouteRecordName,
      label: String(child.meta?.title || child.name),
      icon: child.meta?.icon,
    }))
})

const activeMenu = computed(
  () => (route.meta.activeWorkspaceMenu as RouteRecordName | undefined) || route.name,
)

function goBack() {
  if (backRouteName.value) {
    router.push({ name: backRouteName.value })
    return
  }

  router.back()
}

function openMenu(menu: { name: RouteRecordName }) {
  router.push({ name: menu.name, params: route.params })
}
</script>

<template>
  <SidebarProvider
    class="min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background md:flex-row"
  >
    <Sidebar
      collapsible="none"
      class="h-auto w-full shrink-0 border-b border-sidebar-border md:h-full md:w-(--sidebar-width) md:border-b-0 md:border-r"
    >
      <SidebarHeader class="gap-3 p-4">
        <div class="flex items-center gap-3">
          <Button v-if="backRouteName" type="button" variant="outline" size="icon" @click="goBack">
            <ArrowLeftIcon />
          </Button>

          <div class="min-w-0">
            <p class="text-xs font-medium text-sidebar-primary">
              {{ workspaceLabel }}
            </p>
            <h1 class="truncate text-lg font-semibold text-sidebar-foreground">
              {{ workspaceTitle }}
            </h1>
            <p v-if="workspaceSubtitle" class="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {{ workspaceSubtitle }}
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>菜单</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem v-for="menu in workspaceMenus" :key="String(menu.name)">
                <SidebarMenuButton
                  type="button"
                  size="lg"
                  :is-active="activeMenu === menu.name"
                  @click="openMenu(menu)"
                >
                  <component :is="menu.icon || FolderOpenIcon" />
                  <span>{{ menu.label }}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>

    <SidebarInset class="min-h-0 min-w-0 overflow-auto bg-muted/40">
      <RouterView />
    </SidebarInset>
  </SidebarProvider>
</template>
