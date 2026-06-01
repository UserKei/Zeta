<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { BoxIcon, LibraryIcon, MessageCircleIcon, PowerIcon, UserIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useUserStore } from '@/stores/user'

defineOptions({
  name: 'AppLayout',
})

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const navItems = [
  { name: 'models', label: '模型管理', icon: BoxIcon },
  { name: 'knowledge-bases', label: '知识库', icon: LibraryIcon },
  { name: 'agents', label: '专家 Agent', icon: MessageCircleIcon },
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
  <main class="flex min-h-screen flex-col bg-muted/40">
    <header
      class="sticky top-0 z-20 border-b border-border bg-background/95 shadow-sm backdrop-blur"
    >
      <div
        class="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[minmax(170px,1fr)_auto_minmax(220px,1fr)] lg:items-center lg:px-8"
      >
        <div class="flex min-w-0 items-center">
          <button
            class="group flex min-w-0 items-center gap-2 border-0 bg-transparent p-0 text-left"
            type="button"
            aria-label="回到模型管理"
            @click="router.push({ name: 'models' })"
          >
            <span
              class="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-sm font-extrabold text-primary-foreground shadow-sm transition duration-200 group-hover:opacity-90"
            >
              Z
            </span>
            <span class="truncate text-[26px] font-extrabold leading-none text-foreground">
              Zeta
            </span>
          </button>
        </div>

        <nav
          class="min-w-0 justify-self-stretch overflow-x-auto lg:justify-self-center"
          aria-label="主导航"
        >
          <div class="flex w-max min-w-full items-center gap-2 lg:min-w-0">
            <Button
              v-for="item in navItems"
              :key="item.name"
              :variant="activeMenu === item.name ? 'secondary' : 'ghost'"
              type="button"
              :aria-current="activeMenu === item.name ? 'page' : undefined"
              :class="
                cn(
                  'shrink-0 px-3 font-semibold',
                  activeMenu === item.name && 'border-border bg-card text-foreground shadow-sm',
                  activeMenu !== item.name && 'text-muted-foreground',
                )
              "
              @click="openMenu(item.name)"
            >
              <component :is="item.icon" data-icon="inline-start" />
              <span class="whitespace-nowrap">{{ item.label }}</span>
            </Button>
          </div>
        </nav>

        <div class="flex items-center justify-between gap-3 lg:justify-self-end">
          <div
            class="flex min-w-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground shadow-sm"
          >
            <span
              class="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-foreground"
            >
              <UserIcon />
            </span>
            <strong class="truncate font-semibold text-foreground">
              {{ userStore.displayName }}
            </strong>
          </div>
          <Button variant="outline" type="button" @click="logout">
            <PowerIcon data-icon="inline-start" />
            退出
          </Button>
        </div>
      </div>
    </header>

    <section class="flex min-w-0 min-h-0 flex-1 flex-col">
      <RouterView />
    </section>
  </main>
</template>
