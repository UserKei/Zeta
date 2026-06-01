<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { login } from '@/apis/user'
import { useUserStore } from '@/stores/user'
import { showErrorMessage } from '@/utils/feedback'

defineOptions({
  name: 'LoginView',
})

const router = useRouter()
const userStore = useUserStore()
const username = ref('admin')
const password = ref('123456')
const loading = ref(false)

const submit = async () => {
  loading.value = true

  try {
    const result = await login(username.value, password.value)
    userStore.setAuth(result.user, result.token)
    await router.replace({ name: 'models' })
  } catch (cause) {
    showErrorMessage(cause, '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main
    class="grid min-h-screen grid-cols-1 items-center gap-8 bg-background p-6 text-foreground md:grid-cols-[minmax(280px,1fr)_minmax(320px,420px)] lg:gap-20 lg:p-24"
  >
    <section class="max-w-160">
      <p class="mb-5 w-fit rounded-full border border-border bg-card px-3 py-1.75 font-bold">
        Zeta
      </p>
      <h1 class="m-0 text-[40px] leading-[1.08] font-bold lg:text-[64px]">AI 知识库管理平台</h1>
      <p class="mt-5.5 max-w-120 text-lg text-muted-foreground">
        登录后管理模型、知识库和专家 Agent。
      </p>
    </section>

    <Card class="border-border bg-card">
      <CardHeader>
        <CardTitle class="text-[28px]">登录</CardTitle>
        <CardDescription>使用平台账号继续。</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="grid gap-4" @submit.prevent="submit">
          <div class="grid gap-2">
            <Label for="username">用户名</Label>
            <Input id="username" v-model="username" autocomplete="username" />
          </div>

          <div class="grid gap-2">
            <Label for="password">密码</Label>
            <Input
              id="password"
              v-model="password"
              autocomplete="current-password"
              type="password"
            />
          </div>

          <Button class="mt-1 w-full" :disabled="loading" type="submit">
            {{ loading ? '登录中' : '进入平台' }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </main>
</template>
