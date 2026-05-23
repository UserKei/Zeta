<script setup lang="ts">
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

const isActive = (name: string) => {
  if (name === 'knowledge-bases') {
    return route.name === 'knowledge-bases' || route.name === 'knowledge-base-detail'
  }

  if (name === 'agents') {
    return route.name === 'agents' || route.name === 'agent-chat'
  }

  return route.name === name
}

const logout = async () => {
  userStore.logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <main class="workspace">
    <aside class="sidebar">
      <div>
        <p class="brand">Zeta</p>
        <nav>
          <button
            v-for="item in navItems"
            :key="item.name"
            :class="['nav-item', isActive(item.name) ? 'active' : '']"
            @click="router.push({ name: item.name })"
          >
            <el-icon>
              <component :is="item.icon" />
            </el-icon>
            <span>{{ item.label }}</span>
          </button>
        </nav>
      </div>

      <footer>
        <strong>{{ userStore.displayName }}</strong>
        <button class="button secondary" @click="logout">退出</button>
      </footer>
    </aside>

    <section class="content">
      <RouterView />
    </section>
  </main>
</template>

<style scoped>
.workspace {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
}

.sidebar {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-right: 1px solid var(--zeta-line);
  padding: 28px 18px;
  background: #fff;
}

.brand {
  margin: 0 0 34px;
  color: var(--zeta-blue);
  font-size: 28px;
  font-weight: 800;
}

nav {
  display: grid;
  gap: 8px;
}

.nav-item {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  border-radius: 8px;
  padding: 0 14px;
  background: transparent;
  color: var(--zeta-muted);
  text-align: left;
}

.nav-item.active {
  background: var(--zeta-blue-soft);
  color: var(--zeta-blue);
  font-weight: 700;
}

.sidebar footer {
  display: grid;
  gap: 12px;
}

.content {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 20px;
  padding: clamp(20px, 4vw, 44px);
  background:
    linear-gradient(180deg, rgba(36, 107, 253, 0.1), transparent 210px),
    var(--zeta-bg);
}

@media (max-width: 820px) {
  .workspace {
    grid-template-columns: 1fr;
  }

  .sidebar {
    gap: 18px;
    border-right: 0;
    border-bottom: 1px solid var(--zeta-line);
  }

  .brand {
    margin-bottom: 16px;
  }

  nav {
    grid-template-columns: 1fr;
  }
}
</style>
