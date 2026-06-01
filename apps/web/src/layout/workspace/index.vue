<script setup lang="ts">
import type { RouteRecordName } from 'vue-router'
import { computed } from 'vue'
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
      icon: child.meta?.icon,
    }))
})

const activeMenu = computed(
  () => (route.meta.activeWorkspaceMenu as RouteRecordName | undefined) || route.name,
)

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
