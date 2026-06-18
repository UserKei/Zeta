<script setup lang="ts">
import { computed } from 'vue'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'

const props = withDefaults(
  defineProps<{
    page: number
    pageSize: number
    total: number
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:page': [page: number]
}>()

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const shouldShow = computed(() => props.total > props.pageSize)

const updatePage = (page: number) => {
  if (props.disabled) {
    return
  }

  emit('update:page', page)
}
</script>

<template>
  <div
    v-if="shouldShow"
    class="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
  >
    <span>共 {{ total }} 条，第 {{ page }} / {{ pageCount }} 页</span>
    <Pagination
      :page="page"
      :items-per-page="pageSize"
      :total="total"
      :sibling-count="1"
      show-edges
      @update:page="updatePage"
    >
      <PaginationContent v-slot="{ items }">
        <PaginationPrevious :disabled="disabled" size="sm">上一页</PaginationPrevious>
        <template v-for="(item, index) in items" :key="`${item.type}-${index}`">
          <PaginationItem
            v-if="item.type === 'page'"
            :value="item.value"
            :is-active="item.value === page"
            :disabled="disabled"
            size="sm"
          >
            {{ item.value }}
          </PaginationItem>
          <PaginationEllipsis v-else :disabled="disabled" />
        </template>
        <PaginationNext :disabled="disabled" size="sm">下一页</PaginationNext>
      </PaginationContent>
    </Pagination>
  </div>
</template>
