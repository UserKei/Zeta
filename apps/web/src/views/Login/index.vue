<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
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
    class="grid min-h-screen grid-cols-1 items-center gap-8 bg-(image:--zeta-login-bg) p-6 md:grid-cols-[minmax(280px,1fr)_minmax(320px,420px)] lg:gap-20 lg:p-24">
    <section class="max-w-160">
      <p
        class="mb-5 w-fit rounded-full border border-(--zeta-blue-line) bg-(--zeta-panel) px-3 py-1.75 font-bold text-(--zeta-blue)">
        Zeta
      </p>
      <h1 class="m-0 text-[40px] leading-[1.08] font-bold lg:text-[64px]">AI 知识库管理平台</h1>
      <p class="mt-5.5 max-w-120 text-lg text-(--zeta-muted)">
        登录后管理模型、知识库和专家 Agent。
      </p>
    </section>

    <el-form
      class="grid gap-1 rounded-lg border border-(--zeta-line) bg-(--zeta-panel-glass) p-5 shadow-(--zeta-shadow) sm:p-9"
      label-position="top" @submit.prevent="submit">
      <header>
        <h2 class="m-0 mb-2 text-[28px] font-bold">登录</h2>
        <p class="m-0 text-(--zeta-muted)">使用平台账号继续。</p>
      </header>

      <el-form-item label="用户名">
        <el-input v-model="username" autocomplete="username" />
      </el-form-item>

      <el-form-item label="密码">
        <el-input v-model="password" autocomplete="current-password" show-password type="password" />
      </el-form-item>

      <el-button class="mt-1 w-full" :loading="loading" native-type="submit" type="primary">
        {{ loading ? '登录中' : '进入平台' }}
      </el-button>
    </el-form>
  </main>
</template>
