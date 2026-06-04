<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData } from 'vitepress'

let mermaidRenderId = 0

const props = defineProps<{
  code: string
}>()

const { isDark } = useData()
const container = ref<HTMLElement | null>(null)
const errorMessage = ref('')
const isRendering = ref(false)
let renderSequence = 0

function createMermaidRenderId() {
  mermaidRenderId += 1

  return `zeta-mermaid-${mermaidRenderId}`
}

function decodeDiagram(encoded: string) {
  const binary = window.atob(encoded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))

  return new TextDecoder().decode(bytes)
}

async function renderDiagram() {
  const target = container.value

  if (!target) {
    return
  }

  const currentSequence = ++renderSequence
  target.innerHTML = ''
  errorMessage.value = ''
  isRendering.value = true

  try {
    const { default: mermaid } = await import('mermaid')

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: isDark.value ? 'dark' : 'default',
    })

    const diagramCode = decodeDiagram(props.code)
    const { svg, bindFunctions } = await mermaid.render(
      createMermaidRenderId(),
      diagramCode,
    )

    if (currentSequence !== renderSequence || target !== container.value) {
      return
    }

    target.innerHTML = svg
    bindFunctions?.(target)
  } catch (error) {
    if (currentSequence !== renderSequence) {
      return
    }

    const message = error instanceof Error ? error.message : String(error)
    errorMessage.value = `Mermaid 渲染失败：${message}`
    target.innerHTML = ''
  } finally {
    if (currentSequence === renderSequence) {
      isRendering.value = false
    }
  }
}

onMounted(renderDiagram)
watch([() => props.code, isDark], renderDiagram, { flush: 'post' })
onBeforeUnmount(() => {
  renderSequence += 1
  isRendering.value = false

  if (container.value) {
    container.value.innerHTML = ''
  }
})
</script>

<template>
  <figure class="zeta-mermaid">
    <div ref="container" class="zeta-mermaid__canvas" />
    <figcaption v-if="isRendering" class="zeta-mermaid__status">
      正在渲染图表...
    </figcaption>
    <figcaption v-else-if="errorMessage" class="zeta-mermaid__error">
      {{ errorMessage }}
    </figcaption>
  </figure>
</template>
