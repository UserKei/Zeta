<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import {
  ArrowLeftIcon,
  BoxIcon,
  LibraryIcon,
  MessageCircleIcon,
  PowerIcon,
  UserIcon,
} from '@lucide/vue'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useUserStore } from '@/stores/user'

defineOptions({
  name: 'AppLayout',
})

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

type CurrentRoute = ReturnType<typeof useRoute>
type BreadcrumbTarget = RouteLocationRaw | ((route: CurrentRoute) => RouteLocationRaw)
type BreadcrumbItemConfig = {
  label: string
  to?: BreadcrumbTarget
}

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

const breadcrumbItems = computed(() => {
  const items = route.meta.breadcrumb

  return Array.isArray(items) ? (items as BreadcrumbItemConfig[]) : []
})

const breadcrumbBack = computed(() => route.meta.breadcrumbBack as BreadcrumbTarget | undefined)

const hasBreadcrumb = computed(() => breadcrumbItems.value.length > 0)
const currentBreadcrumbItem = computed(() => breadcrumbItems.value.at(-1))

const resolveRouteTarget = (target?: BreadcrumbTarget) => {
  if (!target) {
    return null
  }

  return typeof target === 'function' ? target(route) : target
}

const openMenu = async (name: string) => {
  await router.push({ name })
}

const openBreadcrumbTarget = async (target?: BreadcrumbTarget) => {
  const routeTarget = resolveRouteTarget(target)

  if (!routeTarget) {
    return
  }

  await router.push(routeTarget)
}

const openBreadcrumbBack = async () => {
  await openBreadcrumbTarget(breadcrumbBack.value)
}

const logout = async () => {
  userStore.logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <main class="flex h-screen min-h-0 flex-col overflow-hidden bg-muted/40">
    <header
      class="sticky top-0 z-20 shrink-0 border-b border-border bg-background/95 shadow-sm backdrop-blur"
    >
      <div
        class="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[minmax(170px,1fr)_auto_minmax(220px,1fr)] lg:items-center lg:px-8"
      >
        <div class="flex min-w-0 items-center gap-3">
          <button
            class="group flex shrink-0 items-center gap-2 border-0 bg-transparent p-0 text-left"
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

          <div v-if="hasBreadcrumb" class="hidden min-w-0 items-center gap-2 md:flex">
            <Separator orientation="vertical" class="h-6" />
            <Button
              v-if="breadcrumbBack"
              variant="ghost"
              size="icon"
              type="button"
              aria-label="返回上一层"
              class="size-8"
              @click="openBreadcrumbBack"
            >
              <ArrowLeftIcon />
            </Button>
            <Breadcrumb class="min-w-0 overflow-hidden">
              <BreadcrumbList class="flex-nowrap">
                <template v-for="(item, index) in breadcrumbItems" :key="`${item.label}-${index}`">
                  <BreadcrumbItem class="min-w-0">
                    <BreadcrumbLink
                      v-if="item.to"
                      as="button"
                      type="button"
                      class="max-w-32 cursor-pointer truncate lg:max-w-44"
                      @click="openBreadcrumbTarget(item.to)"
                    >
                      {{ item.label }}
                    </BreadcrumbLink>
                    <BreadcrumbPage v-else class="max-w-36 truncate lg:max-w-56">
                      {{ item.label }}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator v-if="index < breadcrumbItems.length - 1" />
                </template>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div
            v-if="hasBreadcrumb"
            class="flex min-w-0 items-center gap-2 border-l border-border pl-3 md:hidden"
          >
            <Button
              v-if="breadcrumbBack"
              variant="ghost"
              size="icon"
              type="button"
              aria-label="返回上一层"
              class="size-8"
              @click="openBreadcrumbBack"
            >
              <ArrowLeftIcon />
            </Button>
            <span class="truncate text-sm text-muted-foreground">
              {{ currentBreadcrumbItem?.label }}
            </span>
          </div>
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

    <section class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <RouterView />
    </section>
  </main>
</template>
