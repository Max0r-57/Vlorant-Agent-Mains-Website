import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { isTimeActive, type TimeFilter } from '@/lib/filter'
import type { Position } from '@/types'

/** 首页导览栏的搜索条件（在本次打开期间保留，从详情页返回时不会丢失） */
export const useHomeFilters = defineStore('homeFilters', () => {
  const query = ref('')
  const typeIds = ref<string[]>([])
  const time = ref<TimeFilter>({ preset: 'all' })
  /** 圈画搜索：在地图上圈出的多边形（地图坐标），只显示落点（或站位）在其中的 Lineup */
  const area = shallowRef<Position[] | null>(null)
  /** 在搜索结果里手动隐藏的 Lineup */
  const hiddenIds = ref<string[]>([])

  const active = computed(
    () =>
      !!query.value.trim() ||
      typeIds.value.length > 0 ||
      isTimeActive(time.value) ||
      !!area.value ||
      hiddenIds.value.length > 0,
  )

  function clear() {
    query.value = ''
    typeIds.value = []
    time.value = { preset: 'all' }
    area.value = null
    hiddenIds.value = []
  }

  return { query, typeIds, time, area, hiddenIds, active, clear }
})
