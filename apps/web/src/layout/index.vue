<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import {
  Box,
  ChatDotRound,
  Collection,
  SwitchButton,
  UserFilled,
} from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'

defineOptions({
  name: 'AppLayout',
})

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const navItems = [
  { name: 'models', label: '模型管理', icon: Box },
  { name: 'knowledge-bases', label: '知识库', icon: Collection },
  { name: 'agents', label: '专家 Agent', icon: ChatDotRound },
]

const activeMenu = computed(() => {
  const activeMenu = route.meta.activeMenu

  if (typeof activeMenu === 'string') {
    return activeMenu
  }

  return typeof route.name === 'string' ? route.name : ''
})

const openMenu = async (name: string) => {
  await router.push({ name })
}

const logout = async () => {
  userStore.logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <main class="flex min-h-screen flex-col bg-(image:--zeta-workspace-bg)">
    <header class="sticky top-0 z-20 border-b border-(--zeta-line) bg-(--zeta-panel-glass) shadow-sm backdrop-blur">
      <div
        class="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[minmax(120px,1fr)_auto_minmax(180px,1fr)] lg:items-center lg:px-8">
        <div class="flex min-w-0 items-center">
          <button class="border-0 bg-transparent p-0 text-[26px] font-extrabold text-(--zeta-blue)" type="button"
            @click="router.push({ name: 'models' })">
            Zeta
          </button>
        </div>

        <div class="min-w-0 justify-self-center overflow-x-auto">
          <el-menu :default-active="activeMenu" active-text-color="var(--zeta-blue)" background-color="transparent"
            class="zeta-top-menu" :ellipsis="false" mode="horizontal" text-color="var(--zeta-muted)" @select="openMenu">
            <el-menu-item v-for="item in navItems" :key="item.name" :index="item.name">
              <el-icon>
                <component :is="item.icon" />
              </el-icon>
              <span>{{ item.label }}</span>
            </el-menu-item>
          </el-menu>
        </div>

        <div class="flex items-center justify-between gap-3 lg:justify-self-end">
          <div class="flex min-w-0 items-center gap-2 text-sm text-(--zeta-muted)">
            <el-icon>
              <UserFilled />
            </el-icon>
            <strong class="truncate font-semibold text-(--zeta-content)">
              {{ userStore.displayName }}
            </strong>
          </div>
          <el-button :icon="SwitchButton" @click="logout">退出</el-button>
        </div>
      </div>
    </header>

    <section class="flex min-w-0 min-h-0 flex-1 flex-col p-5 lg:p-8">
      <RouterView />
    </section>
  </main>
</template>

<style scoped>
.zeta-top-menu {
  border-bottom: 0;
  width: max-content;
  min-width: max-content;
}

.zeta-top-menu :deep(.el-menu-item) {
  flex-shrink: 0;
  max-width: none;
}

.zeta-top-menu :deep(.el-menu-item span) {
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
}
</style>
