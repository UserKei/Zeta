<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { getFileBlob } from '@/apis/files'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<{
  editorId: string
  modelValue: string
}>()

const renderedMarkdown = ref(props.modelValue)
const objectUrls = new Map<string, string>()
let loadVersion = 0

const fileReferencePattern = /\.\/files\/([A-Za-z0-9_-]+)/g

const extractFileIds = (markdown: string) => [
  ...new Set(
    [...markdown.matchAll(fileReferencePattern)].map((match) => match[1] ?? ''),
  ),
].filter(Boolean)

const releaseObjectUrls = () => {
  objectUrls.forEach((url) => URL.revokeObjectURL(url))
  objectUrls.clear()
}

const replaceFileReferences = (markdown: string, urls: Map<string, string>) =>
  markdown.replace(fileReferencePattern, (reference, fileId: string) => {
    const url = urls.get(fileId)

    return url ?? reference
  })

watch(
  () => props.modelValue,
  async (markdown) => {
    const currentVersion = ++loadVersion
    renderedMarkdown.value = markdown
    releaseObjectUrls()

    const fileIds = extractFileIds(markdown)

    if (fileIds.length === 0) {
      return
    }

    const loadedEntries = await Promise.all(
      fileIds.map(async (fileId) => {
        try {
          const blob = await getFileBlob(fileId)

          return [fileId, URL.createObjectURL(blob)] as const
        } catch {
          return null
        }
      }),
    )

    if (currentVersion !== loadVersion) {
      loadedEntries.forEach((entry) => {
        if (entry) {
          URL.revokeObjectURL(entry[1])
        }
      })
      return
    }

    loadedEntries.forEach((entry) => {
      if (entry) {
        objectUrls.set(entry[0], entry[1])
      }
    })
    renderedMarkdown.value = replaceFileReferences(markdown, objectUrls)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  loadVersion += 1
  releaseObjectUrls()
})
</script>

<template>
  <MdPreview
    v-bind="$attrs"
    :editor-id="editorId"
    :model-value="renderedMarkdown"
  />
</template>
