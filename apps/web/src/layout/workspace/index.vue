<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute, useRouter, type RouteRecordName } from 'vue-router'
import { ArrowLeft, FolderOpened } from '@element-plus/icons-vue'

defineOptions({
  name: 'WorkspaceLayout',
})

type WorkspaceMenu = {
  name: RouteRecordName
  label: string
  icon?: unknown
  disabled?: boolean
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
      disabled: child.meta?.disabled === true,
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
  if (menu.disabled) {
    return
  }

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
  <div class="grid min-h-[calc(100vh-116px)] grid-cols-1 overflow-hidden rounded-lg border border-(--zeta-line) bg-(--zeta-panel) lg:grid-cols-[232px_minmax(0,1fr)]">
    <aside class="border-b border-(--zeta-line-soft) bg-(--zeta-surface) lg:border-b-0 lg:border-r">
      <div class="grid gap-4 p-4">
        <div class="flex items-start gap-3">
          <el-button
            v-if="backRouteName"
            :icon="ArrowLeft"
            circle
            size="small"
            @click="back"
          />
          <div class="min-w-0">
            <p class="m-0 text-xs font-semibold uppercase tracking-wide text-(--zeta-blue)">
              Workspace
            </p>
            <h2 class="m-0 mt-1 truncate text-lg font-semibold text-(--zeta-ink)">
              {{ workspaceTitle }}
            </h2>
            <p class="m-0 mt-1 text-sm text-(--zeta-muted)">
              {{ workspaceSubtitle }}
            </p>
          </div>
        </div>

        <el-menu
          :default-active="activeMenu"
          background-color="transparent"
          class="zeta-workspace-menu"
          text-color="var(--zeta-muted)"
          active-text-color="var(--zeta-blue)"
        >
          <el-menu-item
            v-for="menu in workspaceMenus"
            :key="String(menu.name)"
            :disabled="menu.disabled"
            :index="String(menu.name)"
            @click="openMenu(menu)"
          >
            <el-icon>
              <component :is="menu.icon || FolderOpened" />
            </el-icon>
            <span>{{ menu.label }}</span>
          </el-menu-item>
        </el-menu>
      </div>
    </aside>

    <section class="min-w-0 bg-(--zeta-bg)">
      <RouterView />
    </section>
  </div>
</template>

<style scoped>
.zeta-workspace-menu {
  border-right: 0;
}

.zeta-workspace-menu :deep(.el-menu-item) {
  height: 42px;
  margin-bottom: 4px;
  border-radius: 6px;
  font-weight: 500;
}

.zeta-workspace-menu :deep(.el-menu-item.is-active) {
  background: var(--zeta-blue-soft);
}
</style>
