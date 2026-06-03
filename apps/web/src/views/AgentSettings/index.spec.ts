import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import AgentSettingsView from './index.vue'
import { getAgent, updateAgent } from '@/apis/agents'
import { listKnowledgeBases } from '@/apis/knowledge-bases'
import { listModels } from '@/apis/models'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { agentId: 'agent-1' } }),
}))

vi.mock('@/apis/agents', () => ({
  getAgent: vi.fn(),
  updateAgent: vi.fn(),
}))

vi.mock('@/apis/knowledge-bases', () => ({
  listKnowledgeBases: vi.fn(),
}))

vi.mock('@/apis/models', () => ({
  listModels: vi.fn(),
}))

vi.mock('@/utils/feedback', () => ({
  showErrorMessage: vi.fn(),
  showSuccessMessage: vi.fn(),
}))

const Passthrough = defineComponent({
  template: '<div><slot /></div>',
})

const ButtonStub = defineComponent({
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>',
})

const InputStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
})

const TextareaStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
})

const CheckboxStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template:
    '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
})

const SelectStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<div><slot /></div>',
})

const SelectItemStub = defineComponent({
  props: ['value'],
  template: '<div><slot /></div>',
})

describe('AgentSettingsView', () => {
  beforeEach(() => {
    vi.mocked(getAgent).mockResolvedValue({
      id: 'agent-1',
      name: 'Test Agent',
      description: null,
      modelId: null,
      systemPrompt: '你是企业知识库专家。',
      openingMessage: null,
      status: 'DRAFT',
      temperature: 0.2,
      topP: 0.8,
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
      model: null,
      knowledgeBases: [],
    })
    vi.mocked(listModels).mockResolvedValue([])
    vi.mocked(listKnowledgeBases).mockResolvedValue([
      {
        id: 'kb-1',
        name: '制度知识库',
        description: null,
        status: 'ACTIVE',
        embeddingModelId: 'embedding-1',
        visionModelId: null,
        rerankerModelId: null,
        chunkSize: 500,
        chunkOverlap: 50,
        metadata: {},
        createdAt: '2026-06-03T00:00:00.000Z',
        updatedAt: '2026-06-03T00:00:00.000Z',
        embeddingModel: {
          id: 'embedding-1',
          name: '向量模型',
          provider: 'aliyun-bailian',
          modelName: 'text-embedding-v4',
          isEnabled: true,
        },
        visionModel: null,
        rerankerModel: null,
      },
    ])
    vi.mocked(updateAgent).mockImplementation(async (_id, payload) => ({
      id: 'agent-1',
      name: payload.name ?? 'Test Agent',
      description: payload.description ?? null,
      modelId: payload.modelId ?? null,
      systemPrompt: payload.systemPrompt ?? '你是企业知识库专家。',
      openingMessage: payload.openingMessage ?? null,
      status: payload.status ?? 'DRAFT',
      temperature: payload.temperature ?? null,
      topP: payload.topP ?? null,
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
      model: null,
      knowledgeBases: [],
    }))
  })

  it('sends selected knowledge base ids when saving settings', async () => {
    const wrapper = mount(AgentSettingsView, {
      global: {
        stubs: {
          Alert: Passthrough,
          AlertDescription: Passthrough,
          AlertTitle: Passthrough,
          Badge: Passthrough,
          Button: ButtonStub,
          Card: Passthrough,
          CardContent: Passthrough,
          CardDescription: Passthrough,
          CardFooter: Passthrough,
          CardHeader: Passthrough,
          CardTitle: Passthrough,
          Checkbox: CheckboxStub,
          Input: InputStub,
          Label: Passthrough,
          Select: SelectStub,
          SelectContent: Passthrough,
          SelectGroup: Passthrough,
          SelectItem: SelectItemStub,
          SelectTrigger: Passthrough,
          SelectValue: Passthrough,
          Textarea: TextareaStub,
        },
      },
    })
    await flushPromises()

    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.findAll('button').at(-1)?.trigger('click')

    expect(updateAgent).toHaveBeenCalledWith(
      'agent-1',
      expect.objectContaining({
        knowledgeBaseIds: ['kb-1'],
      }),
    )
  })
})
