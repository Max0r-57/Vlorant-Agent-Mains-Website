import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { isTimeActive, type TimeFilter } from '@/lib/filter'

/** 首页导览栏的搜索条件（在本次打开期间保留，从详情页返回时不会丢失） */
export const useHomeFilters = defineStore('homeFilters', () => {
  const query = ref('')
  const typeIds = ref<string[]>([])
  const time = ref<TimeFilter>({ preset: 'all' })

  const active = computed(() => !!query.value.trim() || typeIds.value.length > 0 || isTimeActive(time.value))

  function clear() {
    query.value = ''
    typeIds.value = []
    time.value = { preset: 'all' }
  }

  return { query, typeIds, time, active, clear }
})
