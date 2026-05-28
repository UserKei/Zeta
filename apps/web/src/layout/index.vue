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
        class="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[minmax(170px,1fr)_auto_minmax(220px,1fr)] lg:items-center lg:px-8">
        <div class="flex min-w-0 items-center">
          <button class="group flex min-w-0 items-center gap-2 border-0 bg-transparent p-0 text-left" type="button"
            aria-label="回到模型管理" @click="router.push({ name: 'models' })">
            <span
              class="grid size-9 shrink-0 place-items-center rounded-xl bg-(--zeta-blue) text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(36,107,253,0.22)] transition duration-200 group-hover:bg-(--zeta-blue-hover)">
              Z
            </span>
            <span class="truncate text-[26px] font-extrabold leading-none text-(--zeta-blue)">
              Zeta
            </span>
          </button>
        </div>

        <nav class="min-w-0 justify-self-stretch overflow-x-auto lg:justify-self-center" aria-label="主导航">
          <div class="flex w-max min-w-full items-center gap-2 lg:min-w-0">
            <button v-for="item in navItems" :key="item.name"
              class="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition duration-200"
              :class="activeMenu === item.name
                ? 'border-(--zeta-blue-line) bg-(--zeta-blue-soft) text-(--zeta-blue) shadow-[0_6px_16px_rgba(36,107,253,0.14)]'
                : 'border-transparent bg-transparent text-(--zeta-muted) hover:border-(--zeta-line-soft) hover:bg-(--zeta-surface) hover:text-(--zeta-content)'"
              type="button" :aria-current="activeMenu === item.name ? 'page' : undefined" @click="openMenu(item.name)">
              <el-icon class="text-base">
                <component :is="item.icon" />
              </el-icon>
              <span class="whitespace-nowrap">{{ item.label }}</span>
            </button>
          </div>
        </nav>

        <div class="flex items-center justify-between gap-3 lg:justify-self-end">
          <div class="flex min-w-0 items-center gap-2 rounded-full bg-(--zeta-surface) px-3 py-1.5 text-sm text-(--zeta-muted)">
            <span class="grid size-7 shrink-0 place-items-center rounded-full bg-(--zeta-blue-soft) text-(--zeta-blue)">
              <el-icon>
                <UserFilled />
              </el-icon>
            </span>
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
