<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import {
  deleteKnowledgeBase,
  getKnowledgeBase,
  updateKnowledgeBase,
  type KnowledgeBase,
  type KnowledgeBasePayload,
} from '@/apis/knowledge-bases'
import { listModels, type AiModel } from '@/apis/models'
import { isCancelAction, showErrorMessage, showSuccessMessage } from '@/utils/feedback'

defineOptions({
  name: 'KnowledgeSettingsView',
})

const route = useRoute()
const router = useRouter()
const knowledgeBaseId = computed(() => String(route.params.knowledgeBaseId ?? ''))

const knowledgeBase = ref<KnowledgeBase | null>(null)
const models = ref<AiModel[]>([])
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)

const form = reactive<KnowledgeBasePayload>({
  name: '',
  description: '',
  status: 'ACTIVE',
  embeddingModelId: '',
  visionModelId: null,
  imageUnderstandingPrompt: '',
  chunkSize: 800,
  chunkOverlap: 100,
})

const defaultImageUnderstandingPrompt =
  '请先提取图片中的可读文字；如果图片不是纯文字内容，请用中文总结图片表达的业务信息，突出对知识检索有价值的事实。'

const embeddingModels = computed(() =>
  models.value.filter((model) => model.type === 'EMBEDDING' && model.isEnabled),
)

const visionModels = computed(() =>
  models.value.filter((model) => model.type === 'IMAGE' && model.isEnabled),
)

const canSave = computed(
  () =>
    form.name.trim().length > 0 &&
    form.embeddingModelId.length > 0 &&
    form.chunkSize > 0 &&
    form.chunkOverlap >= 0 &&
    form.chunkOverlap < form.chunkSize,
)

const load = async () => {
  loading.value = true

  try {
    const [knowledgeBaseDetail, modelList] = await Promise.all([
      getKnowledgeBase(knowledgeBaseId.value),
      listModels(),
    ])
    knowledgeBase.value = knowledgeBaseDetail
    models.value = modelList
    Object.assign(form, {
      name: knowledgeBaseDetail.name,
      description: knowledgeBaseDetail.description ?? '',
      status: knowledgeBaseDetail.status,
      embeddingModelId: knowledgeBaseDetail.embeddingModelId ?? '',
      visionModelId: knowledgeBaseDetail.visionModelId ?? null,
      imageUnderstandingPrompt:
        typeof knowledgeBaseDetail.metadata.imageUnderstandingPrompt === 'string'
          ? knowledgeBaseDetail.metadata.imageUnderstandingPrompt
          : defaultImageUnderstandingPrompt,
      chunkSize: knowledgeBaseDetail.chunkSize,
      chunkOverlap: knowledgeBaseDetail.chunkOverlap,
    })
  } catch (cause) {
    showErrorMessage(cause, '加载知识库设置失败')
  } finally {
    loading.value = false
  }
}

const save = async () => {
  if (!canSave.value) {
    return
  }

  saving.value = true

  try {
    const updated = await updateKnowledgeBase(knowledgeBaseId.value, {
      name: form.name.trim(),
      description: String(form.description ?? '').trim() || null,
      status: form.status,
      embeddingModelId: form.embeddingModelId,
      visionModelId: form.visionModelId || null,
      imageUnderstandingPrompt: String(form.imageUnderstandingPrompt ?? '').trim() || null,
      chunkSize: form.chunkSize,
      chunkOverlap: form.chunkOverlap,
    })
    knowledgeBase.value = updated
    showSuccessMessage('知识库设置已保存')
  } catch (cause) {
    showErrorMessage(cause, '保存知识库设置失败')
  } finally {
    saving.value = false
  }
}

const remove = async () => {
  if (!knowledgeBase.value) {
    return
  }

  try {
    await ElMessageBox.confirm(
      `删除知识库「${knowledgeBase.value.name}」？删除后文档、分段、向量和绑定关系会同步清理。`,
      '删除知识库',
      {
        cancelButtonText: '取消',
        confirmButtonText: '删除',
        type: 'warning',
      },
    )
    deleting.value = true
    await deleteKnowledgeBase(knowledgeBase.value.id)
    await router.push({ name: 'knowledge-bases' })
  } catch (cause) {
    if (isCancelAction(cause)) {
      return
    }

    showErrorMessage(cause, '删除知识库失败')
  } finally {
    deleting.value = false
  }
}

const modelLabel = (model: AiModel) => `${model.name} · ${model.provider} / ${model.modelName}`

onMounted(load)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col p-4 lg:p-6">
    <header class="mb-4">
      <h1 class="m-0 text-2xl font-semibold text-(--zeta-ink)">知识库设置</h1>
      <p class="m-0 mt-1.5 text-sm text-(--zeta-muted)">管理知识库基础信息、索引配置和危险操作。</p>
    </header>

    <section
      v-loading="loading"
      class="min-h-0 flex-1 overflow-auto rounded-lg border border-(--zeta-line) bg-(--zeta-panel)"
    >
      <div class="mx-auto grid max-w-3xl gap-5 p-4 lg:p-6">
        <section class="rounded-lg border border-(--zeta-line-soft) bg-(--zeta-surface-tint) p-4">
          <h2
            class="m-0 border-l-3 border-(--zeta-blue) pl-3 text-lg font-semibold text-(--zeta-ink)"
          >
            基础信息
          </h2>
          <el-form class="mt-4" label-position="top" @submit.prevent="save">
            <el-form-item label="知识库名称" required>
              <el-input v-model="form.name" maxlength="80" show-word-limit />
            </el-form-item>
            <el-form-item label="描述">
              <el-input
                v-model="form.description"
                :rows="4"
                maxlength="500"
                placeholder="描述知识库内容，便于后续管理和检索调试"
                show-word-limit
                type="textarea"
              />
            </el-form-item>
            <el-form-item label="状态">
              <el-radio-group v-model="form.status">
                <el-radio-button value="ACTIVE">启用</el-radio-button>
                <el-radio-button value="DISABLED">停用</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-form>
        </section>

        <section class="rounded-lg border border-(--zeta-line-soft) bg-(--zeta-surface-tint) p-4">
          <h2
            class="m-0 border-l-3 border-(--zeta-blue) pl-3 text-lg font-semibold text-(--zeta-ink)"
          >
            索引配置
          </h2>
          <p
            class="m-0 mt-3 rounded-lg bg-(--zeta-blue-soft) px-3 py-2 text-sm text-(--zeta-content)"
          >
            分段大小和重叠配置不会自动重切已有分段，只影响后续导入或重建索引。
          </p>
          <el-form class="mt-4" label-position="top" @submit.prevent="save">
            <el-form-item label="Embedding 模型" required>
              <el-select
                v-model="form.embeddingModelId"
                filterable
                placeholder="请选择启用的 Embedding 模型"
              >
                <el-option
                  v-for="model in embeddingModels"
                  :key="model.id"
                  :label="modelLabel(model)"
                  :value="model.id"
                />
              </el-select>
            </el-form-item>
            <div class="grid gap-4 md:grid-cols-2">
              <el-form-item label="分段大小">
                <el-input-number
                  v-model="form.chunkSize"
                  :max="5000"
                  :min="100"
                  controls-position="right"
                  class="w-full"
                />
              </el-form-item>
              <el-form-item label="分段重叠">
                <el-input-number
                  v-model="form.chunkOverlap"
                  :max="form.chunkSize - 1"
                  :min="0"
                  controls-position="right"
                  class="w-full"
                />
              </el-form-item>
            </div>
          </el-form>
        </section>

        <section class="rounded-lg border border-(--zeta-line-soft) bg-(--zeta-surface-tint) p-4">
          <h2
            class="m-0 border-l-3 border-(--zeta-blue) pl-3 text-lg font-semibold text-(--zeta-ink)"
          >
            图片理解
          </h2>
          <p
            class="m-0 mt-3 rounded-lg bg-(--zeta-blue-soft) px-3 py-2 text-sm text-(--zeta-content)"
          >
            未配置视觉模型时，DOCX 图片和扫描 PDF 页面图会保留并可预览，但不会生成图片理解分段。
          </p>
          <el-form class="mt-4" label-position="top" @submit.prevent="save">
            <el-form-item label="图片理解模型">
              <el-select
                v-model="form.visionModelId"
                clearable
                filterable
                placeholder="可选：请选择启用的视觉模型"
              >
                <el-option
                  v-for="model in visionModels"
                  :key="model.id"
                  :label="modelLabel(model)"
                  :value="model.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="图片理解提示词">
              <el-input
                v-model="form.imageUnderstandingPrompt"
                :rows="5"
                maxlength="1000"
                placeholder="用于指导视觉模型提取图片中的知识信息"
                show-word-limit
                type="textarea"
              />
            </el-form-item>
          </el-form>
        </section>

        <div class="flex justify-end">
          <el-button :disabled="!canSave" :loading="saving" type="primary" @click="save">
            保存设置
          </el-button>
        </div>

        <section class="rounded-lg border border-(--zeta-danger-line) bg-(--zeta-panel) p-4">
          <h2 class="m-0 text-lg font-semibold text-(--zeta-danger)">危险操作</h2>
          <p class="m-0 mt-2 text-sm leading-6 text-(--zeta-muted)">
            删除知识库会同步清理文档、分段、向量、引用和 Agent 绑定关系。该操作不可恢复。
          </p>
          <div class="mt-4">
            <el-button :loading="deleting" type="danger" @click="remove">删除知识库</el-button>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>
