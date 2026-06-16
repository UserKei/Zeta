<script setup lang="ts">
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

defineOptions({
  name: 'MarkdownEditor',
})

const modelValue = defineModel<string>({ required: true })
</script>

<template>
  <MdEditor v-model="modelValue" v-bind="$attrs" />
</template>
