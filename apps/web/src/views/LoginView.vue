<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { login } from '@/api'
import { saveAuth } from '@/auth'

const router = useRouter()
const username = ref('admin')
const password = ref('zeta-admin')
const error = ref('')
const loading = ref(false)

const submit = async () => {
  loading.value = true
  error.value = ''

  try {
    const result = await login(username.value, password.value)
    saveAuth(result.user, result.token)
    await router.replace({ name: 'models' })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-intro">
      <p class="eyebrow">Zeta</p>
      <h1>AI 知识库管理平台</h1>
      <p>先登录，再把模型能力接进知识库主链路。</p>
    </section>

    <form class="login-panel" @submit.prevent="submit">
      <header>
        <h2>登录</h2>
        <p>首版账号由 seed 初始化。</p>
      </header>

      <label class="field">
        用户名
        <input v-model="username" autocomplete="username" required />
      </label>

      <label class="field">
        密码
        <input v-model="password" autocomplete="current-password" type="password" required />
      </label>

      <p v-if="error" class="message">{{ error }}</p>

      <button class="button" :disabled="loading" type="submit">
        {{ loading ? '登录中' : '进入平台' }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(320px, 420px);
  align-items: center;
  gap: clamp(24px, 6vw, 92px);
  padding: clamp(24px, 7vw, 96px);
  background:
    linear-gradient(120deg, rgba(36, 107, 253, 0.16), transparent 42%),
    linear-gradient(180deg, #f8fbff 0%, #f3f5f9 100%);
}

.login-intro {
  max-width: 640px;
}

.eyebrow {
  width: fit-content;
  margin: 0 0 20px;
  border: 1px solid #cbdcfb;
  border-radius: 999px;
  padding: 7px 12px;
  background: #fff;
  color: var(--zeta-blue);
  font-weight: 700;
}

h1 {
  margin: 0;
  font-size: clamp(38px, 5vw, 72px);
  line-height: 1.08;
}

.login-intro p:last-child {
  max-width: 480px;
  margin: 22px 0 0;
  color: var(--zeta-muted);
  font-size: 18px;
}

.login-panel {
  display: grid;
  gap: 18px;
  border: 1px solid var(--zeta-line);
  border-radius: 8px;
  padding: clamp(20px, 4vw, 36px);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: var(--zeta-shadow);
}

.login-panel h2 {
  margin: 0 0 8px;
  font-size: 28px;
}

.login-panel header p {
  margin: 0;
  color: var(--zeta-muted);
}

@media (max-width: 760px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  h1 {
    font-size: 40px;
  }
}
</style>
