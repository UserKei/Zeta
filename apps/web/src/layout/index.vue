<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { Box, ChatDotRound, Collection } from '@element-plus/icons-vue'
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
  if (route.name === 'knowledge-documents' || route.name === 'paragraph') {
    return 'knowledge-bases'
  }

  if (route.name === 'agent-chat') {
    return 'agents'
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
  <main class="grid min-h-screen grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
    <aside
      class="flex flex-col justify-between gap-4.5 border-b border-(--zeta-line) bg-(--zeta-panel) px-4.5 py-7 lg:border-r lg:border-b-0">
      <div>
        <p class="mb-4 text-[28px] font-extrabold text-(--zeta-blue) lg:mb-8.5">Zeta</p>
        <el-menu
          :default-active="activeMenu"
          active-text-color="var(--zeta-blue)"
          background-color="transparent"
          class="zeta-sidebar-menu"
          text-color="var(--zeta-muted)"
          @select="openMenu"
        >
          <el-menu-item v-for="item in navItems" :key="item.name" :index="item.name">
            <el-icon>
              <component :is="item.icon" />
            </el-icon>
            <span>{{ item.label }}</span>
          </el-menu-item>
        </el-menu>
      </div>

      <footer class="grid gap-3">
        <strong>{{ userStore.displayName }}</strong>
        <el-button @click="logout">退出</el-button>
      </footer>
    </aside>

    <section class="grid min-w-0 content-start gap-5 bg-(image:--zeta-workspace-bg) p-5 lg:p-11">
      <RouterView />
    </section>
  </main>
</template>

<style scoped>
.zeta-sidebar-menu {
  border-right: 0;
}
</style>
