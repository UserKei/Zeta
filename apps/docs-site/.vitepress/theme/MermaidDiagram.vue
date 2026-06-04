<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{
  code: string
}>()

const container = ref<HTMLElement | null>(null)
const errorMessage = ref('')
let renderCounter = 0

function decodeDiagram(encoded: string) {
  const binary = window.atob(encoded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))

  return new TextDecoder().decode(bytes)
}

async function renderDiagram() {
  if (!container.value) {
    return
  }

  try {
    errorMessage.value = ''
    const { default: mermaid } = await import('mermaid')
    const isDark = document.documentElement.classList.contains('dark')

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: isDark ? 'dark' : 'default',
    })

    renderCounter += 1
    const diagramCode = decodeDiagram(props.code)
    const { svg } = await mermaid.render(`zeta-mermaid-${renderCounter}`, diagramCode)
    container.value.innerHTML = svg
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    errorMessage.value = `Mermaid 渲染失败：${message}`
    container.value.innerHTML = ''
  }
}

onMounted(renderDiagram)
watch(() => props.code, renderDiagram)
</script>

<template>
  <figure class="zeta-mermaid">
    <div ref="container" class="zeta-mermaid__canvas" />
    <figcaption v-if="errorMessage" class="zeta-mermaid__error">
      {{ errorMessage }}
    </figcaption>
  </figure>
</template>
