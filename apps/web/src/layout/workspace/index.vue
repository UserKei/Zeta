<script setup lang="ts">
import type { RouteRecordName } from 'vue-router'
import { computed, type Component } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { FolderOpenIcon } from '@lucide/vue'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar'

defineOptions({
  name: 'WorkspaceLayout',
})

const route = useRoute()
const router = useRouter()

type RoutePreload = () => Promise<unknown>
type WorkspaceMenu = {
  name: RouteRecordName
  label: string
  icon?: Component
  preload?: RoutePreload
}

const preloadedMenus = new Set<RouteRecordName>()

function isRoutePreload(value: unknown): value is RoutePreload {
  return typeof value === 'function'
}

const workspaceRoute = computed(() =>
  route.matched.find((record) => record.children?.some((child) => child.meta?.workspaceMenu)),
)

const workspaceMenus = computed(() => {
  const parent = workspaceRoute.value
  if (!parent) return []

  return parent.children
    .filter((child) => child.meta?.workspaceMenu)
    .map((child) => ({
      name: child.name as RouteRecordName,
      label: String(child.meta?.title || child.name),
      icon: child.meta?.icon as Component | undefined,
      preload: isRoutePreload(child.meta?.preload) ? child.meta.preload : undefined,
    }))
})

const activeMenu = computed(
  () => (route.meta.activeWorkspaceMenu as RouteRecordName | undefined) || route.name,
)

function openMenu(menu: { name: RouteRecordName }) {
  router.push({ name: menu.name, params: route.params })
}

function preloadMenu(menu: WorkspaceMenu) {
  if (!menu.preload || preloadedMenus.has(menu.name)) {
    return
  }

  preloadedMenus.add(menu.name)
  void menu.preload().catch(() => {
    preloadedMenus.delete(menu.name)
  })
}
</script>

<template>
  <SidebarProvider
    class="h-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background md:flex-row"
  >
    <Sidebar
      collapsible="none"
      class="h-auto w-full shrink-0 border-b border-sidebar-border md:h-full md:w-(--sidebar-width) md:border-b-0 md:border-r"
    >
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
                  @mouseenter="preloadMenu(menu)"
                  @focus="preloadMenu(menu)"
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
