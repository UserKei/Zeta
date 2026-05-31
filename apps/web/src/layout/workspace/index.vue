<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute, useRouter, type RouteRecordName } from 'vue-router'
import { ArrowLeftIcon, FolderOpenIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

defineOptions({
  name: 'WorkspaceLayout',
})

type WorkspaceMenu = {
  name: RouteRecordName
  label: string
  icon?: unknown
}

const route = useRoute()
const router = useRouter()

const workspaceRoute = computed(() =>
  [...route.matched]
    .reverse()
    .find((record) => record.children.some((child) => child.meta?.workspaceMenu === true)),
)

const workspaceTitle = computed(() => {
  const title = workspaceRoute.value?.meta.workspaceTitle

  return typeof title === 'string' ? title : '工作区'
})

const workspaceSubtitle = computed(() => {
  const subtitle = workspaceRoute.value?.meta.workspaceSubtitle

  return typeof subtitle === 'string' ? subtitle : '资源配置与管理'
})

const backRouteName = computed(() => {
  const name = workspaceRoute.value?.meta.workspaceBackRoute

  return typeof name === 'string' ? name : undefined
})

const workspaceMenus = computed<WorkspaceMenu[]>(() => {
  const children = workspaceRoute.value?.children ?? []

  return children
    .filter((child) => child.meta?.workspaceMenu === true && child.name)
    .map((child) => ({
      name: child.name as RouteRecordName,
      label: typeof child.meta?.title === 'string' ? child.meta.title : String(child.name),
      icon: child.meta?.icon,
    }))
})

const activeMenu = computed(() => {
  const activeWorkspaceMenu = route.meta.activeWorkspaceMenu

  if (typeof activeWorkspaceMenu === 'string') {
    return activeWorkspaceMenu
  }

  return typeof route.name === 'string' ? route.name : ''
})

const openMenu = async (menu: WorkspaceMenu) => {
  await router.push({
    name: menu.name,
    params: route.params,
  })
}

const back = async () => {
  if (backRouteName.value) {
    await router.push({ name: backRouteName.value })
  }
}
</script>

<template>
  <div class="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-[236px_minmax(0,1fr)] lg:grid-rows-none">
    <aside class="border-b border-border bg-sidebar text-sidebar-foreground lg:border-b-0 lg:border-r">
      <div class="flex h-full min-h-0 flex-col gap-5 p-4">
        <div class="flex items-start gap-3">
          <Button
            v-if="backRouteName"
            variant="outline"
            size="icon"
            type="button"
            aria-label="返回"
            @click="back"
          >
            <ArrowLeftIcon />
          </Button>
          <div class="min-w-0">
            <p class="m-0 text-xs font-semibold text-primary">
              知识库工作区
            </p>
            <h2 class="m-0 mt-1 truncate text-lg font-semibold text-sidebar-foreground">
              {{ workspaceTitle }}
            </h2>
            <p class="m-0 mt-0.5 text-sm text-muted-foreground">
              {{ workspaceSubtitle }}
            </p>
          </div>
        </div>

        <nav class="flex min-h-0 flex-1 flex-col gap-2" aria-label="工作区导航">
          <Button
            v-for="menu in workspaceMenus"
            :key="String(menu.name)"
            :variant="activeMenu === menu.name ? 'secondary' : 'ghost'"
            type="button"
            :aria-current="activeMenu === menu.name ? 'page' : undefined"
            :class="cn(
              'h-11 justify-start px-3 text-base font-semibold',
              activeMenu === menu.name && 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm',
              activeMenu !== menu.name && 'text-muted-foreground hover:text-sidebar-foreground',
            )"
            @click="openMenu(menu)"
          >
            <component :is="menu.icon || FolderOpenIcon" data-icon="inline-start" />
            <span>{{ menu.label }}</span>
          </Button>
        </nav>
      </div>
    </aside>

    <section class="flex min-w-0 min-h-0 flex-col bg-muted/40">
      <RouterView />
    </section>
  </div>
</template>
