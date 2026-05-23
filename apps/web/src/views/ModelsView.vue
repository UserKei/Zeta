<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  createModel,
  deleteModel,
  getCurrentUser,
  listModels,
  updateModel,
  type AiModel,
  type AiModelType,
  type ModelPayload,
} from '@/api'
import { clearAuth, getStoredUser, type AuthUser } from '@/auth'

const router = useRouter()
const models = ref<AiModel[]>([])
const user = ref<AuthUser | null>(getStoredUser())
const error = ref('')
const loading = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)
const formOpen = ref(false)

const modelTypes: { value: AiModelType; label: string; hint: string }[] = [
  { value: 'CHAT', label: '对话模型', hint: 'Agent 生成回答' },
  { value: 'EMBEDDING', label: 'Embedding', hint: '文档与问题向量化' },
  { value: 'RERANKER', label: 'Reranker', hint: '召回结果重排' },
]

const form = reactive<ModelPayload>({
  name: '',
  provider: '',
  type: 'CHAT',
  modelName: '',
  baseUrl: '',
  apiKey: '',
  isEnabled: true,
})

const title = computed(() => (editingId.value ? '编辑模型' : '添加模型'))

const load = async () => {
  loading.value = true
  error.value = ''

  try {
    const [currentUser, modelList] = await Promise.all([getCurrentUser(), listModels()])
    user.value = currentUser
    models.value = modelList
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载模型失败'
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  editingId.value = null
  Object.assign(form, {
    name: '',
    provider: '',
    type: 'CHAT',
    modelName: '',
    baseUrl: '',
    apiKey: '',
    isEnabled: true,
  })
  formOpen.value = true
}

const openEdit = (model: AiModel) => {
  editingId.value = model.id
  Object.assign(form, {
    name: model.name,
    provider: model.provider,
    type: model.type,
    modelName: model.modelName,
    baseUrl: model.baseUrl ?? '',
    apiKey: '',
    isEnabled: model.isEnabled,
  })
  formOpen.value = true
}

const save = async () => {
  saving.value = true
  error.value = ''

  try {
    const payload = {
      ...form,
      apiKey: form.apiKey || undefined,
      baseUrl: form.baseUrl || undefined,
    }

    const saved = editingId.value
      ? await updateModel(editingId.value, payload)
      : await createModel(payload)

    const index = models.value.findIndex((model) => model.id === saved.id)

    if (index >= 0) {
      models.value[index] = saved
    } else {
      models.value.unshift(saved)
    }

    formOpen.value = false
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存模型失败'
  } finally {
    saving.value = false
  }
}

const remove = async (model: AiModel) => {
  error.value = ''

  try {
    await deleteModel(model.id)
    models.value = models.value.filter((item) => item.id !== model.id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '删除模型失败'
  }
}

const logout = async () => {
  clearAuth()
  await router.replace({ name: 'login' })
}

onMounted(load)
</script>

<template>
  <main class="workspace">
    <aside class="sidebar">
      <div>
        <p class="brand">Zeta</p>
        <nav>
          <button class="nav-item active">模型管理</button>
          <button class="nav-item" @click="router.push({ name: 'knowledge-bases' })">知识库</button>
          <button class="nav-item" @click="router.push({ name: 'agents' })">专家 Agent</button>
        </nav>
      </div>

      <footer>
        <strong>{{ user?.displayName || user?.username || '当前用户' }}</strong>
        <button class="button secondary" @click="logout">退出</button>
      </footer>
    </aside>

    <section class="content">
      <header class="page-head">
        <div>
          <p class="eyebrow">MVP 第一阶段</p>
          <h1>模型管理</h1>
          <p>先把对话、向量化和重排能力接进平台。</p>
        </div>
        <button class="button" @click="openCreate">添加模型</button>
      </header>

      <p v-if="error" class="message">{{ error }}</p>

      <section class="type-strip" aria-label="模型用途">
        <article v-for="type in modelTypes" :key="type.value">
          <strong>{{ type.label }}</strong>
          <span>{{ type.hint }}</span>
        </article>
      </section>

      <section class="model-panel">
        <div v-if="loading" class="empty">模型加载中</div>
        <div v-else-if="models.length === 0" class="empty">还没有模型配置</div>

        <table v-else>
          <thead>
            <tr>
              <th>名称</th>
              <th>供应商</th>
              <th>类型</th>
              <th>模型标识</th>
              <th>凭证</th>
              <th>状态</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="model in models" :key="model.id">
              <td>
                <strong>{{ model.name }}</strong>
                <small>{{ model.baseUrl || '默认 Base URL' }}</small>
              </td>
              <td>{{ model.provider }}</td>
              <td>{{ modelTypes.find((item) => item.value === model.type)?.label }}</td>
              <td>{{ model.modelName }}</td>
              <td>{{ model.apiKeyMasked || '未配置' }}</td>
              <td>
                <span :class="['status', model.isEnabled ? 'enabled' : 'disabled']">
                  {{ model.isEnabled ? '启用' : '停用' }}
                </span>
              </td>
              <td class="actions">
                <button class="button secondary" @click="openEdit(model)">编辑</button>
                <button class="button danger" @click="remove(model)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </section>

    <div v-if="formOpen" class="dialog-backdrop" @click.self="formOpen = false">
      <form class="dialog" @submit.prevent="save">
        <header>
          <h2>{{ title }}</h2>
          <button class="close" aria-label="关闭" type="button" @click="formOpen = false">x</button>
        </header>

        <div class="form-grid">
          <label class="field">
            配置名称
            <input v-model="form.name" required />
          </label>
          <label class="field">
            供应商
            <input v-model="form.provider" placeholder="OpenAI / DeepSeek" required />
          </label>
          <label class="field">
            模型类型
            <select v-model="form.type">
              <option v-for="type in modelTypes" :key="type.value" :value="type.value">
                {{ type.label }}
              </option>
            </select>
          </label>
          <label class="field">
            模型标识
            <input v-model="form.modelName" placeholder="gpt-4.1-mini" required />
          </label>
          <label class="field full">
            Base URL
            <input v-model="form.baseUrl" placeholder="https://api.example.com/v1" />
          </label>
          <label class="field full">
            API Key
            <input
              v-model="form.apiKey"
              autocomplete="off"
              :placeholder="editingId ? '留空表示保持原凭证' : '可留空'"
              type="password"
            />
          </label>
        </div>

        <label class="toggle">
          <input v-model="form.isEnabled" type="checkbox" />
          启用这个模型配置
        </label>

        <footer>
          <button class="button secondary" type="button" @click="formOpen = false">取消</button>
          <button class="button" :disabled="saving" type="submit">
            {{ saving ? '保存中' : '保存' }}
          </button>
        </footer>
      </form>
    </div>
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

.page-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 18px;
}

.eyebrow {
  margin: 0 0 10px;
  color: var(--zeta-blue);
  font-weight: 700;
}

h1,
h2 {
  margin: 0;
}

h1 {
  font-size: 34px;
}

.page-head p:last-child {
  margin: 10px 0 0;
  color: var(--zeta-muted);
}

.type-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.type-strip article {
  display: grid;
  gap: 8px;
  border: 1px solid var(--zeta-line);
  border-radius: 8px;
  padding: 18px;
  background: var(--zeta-panel);
}

.type-strip span,
td small {
  color: var(--zeta-muted);
}

.model-panel {
  min-width: 0;
  overflow: auto;
  border: 1px solid var(--zeta-line);
  border-radius: 8px;
  background: var(--zeta-panel);
}

.empty {
  min-height: 220px;
  display: grid;
  place-items: center;
  color: var(--zeta-muted);
}

table {
  width: 100%;
  min-width: 860px;
  border-collapse: collapse;
}

th,
td {
  border-bottom: 1px solid var(--zeta-line);
  padding: 16px;
  text-align: left;
}

th {
  color: var(--zeta-muted);
  font-size: 13px;
  font-weight: 700;
}

td:first-child {
  display: grid;
  gap: 4px;
}

tr:last-child td {
  border-bottom: 0;
}

.status {
  display: inline-flex;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 13px;
  font-weight: 700;
}

.status.enabled {
  background: #e3f6ed;
  color: var(--zeta-green);
}

.status.disabled {
  background: #eef1f6;
  color: var(--zeta-muted);
}

.actions {
  display: flex;
  gap: 8px;
  white-space: nowrap;
}

.actions .button {
  min-height: 34px;
  padding: 0 12px;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(14, 24, 45, 0.34);
}

.dialog {
  width: min(100%, 680px);
  display: grid;
  gap: 20px;
  border: 1px solid var(--zeta-line);
  border-radius: 8px;
  padding: 24px;
  background: #fff;
  box-shadow: var(--zeta-shadow);
}

.dialog header,
.dialog footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dialog footer {
  justify-content: flex-end;
}

.close {
  width: 36px;
  height: 36px;
  border: 1px solid var(--zeta-line);
  border-radius: 8px;
  background: #fff;
  color: var(--zeta-muted);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.field.full {
  grid-column: 1 / -1;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 10px;
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

  nav,
  .type-strip,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .page-head {
    align-items: start;
    flex-direction: column;
  }
}
</style>
