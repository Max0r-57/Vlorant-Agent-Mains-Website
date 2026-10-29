<script setup lang="ts">
import type { MapMetric } from '@/lib/geometry'
import { routeName } from '@/lib/paths'
import { buildRoute, formatDuration } from '@/lib/rehearsal'
import type { PathRoute } from '@/types'
import Icon from '@/components/common/Icon.vue'

/**
 * 路径版本列表（新建面板和详情页共用）：点击版本进入路径编辑，× 删除版本，
 * 「新增版本」画一个新的版本。active 是地图上正在显示的版本。
 */
defineProps<{
  routes: PathRoute[]
  active: number
  metric: MapMetric
}>()
const emit = defineEmits<{ edit: [index: number]; add: []; remove: [index: number] }>()
</script>

<template>
  <div class="route-chips">
    <div v-for="(r, i) in routes" :key="r.id" class="chip" :class="{ active: i === active }">
      <button type="button" class="chip-main" :title="`编辑${routeName(r, i)}`" @click="emit('edit', i)">
        <span class="chip-name ellipsis">{{ routeName(r, i) }}</span>
        <span class="chip-meta tabular">{{ r.paths.length }} 段 · {{ formatDuration(buildRoute(r.paths, metric).duration) }}</span>
      </button>
      <button type="button" class="chip-del" :aria-label="`删除${routeName(r, i)}`" @click="emit('remove', i)">
        <Icon name="x" :size="13" />
      </button>
    </div>
    <button type="button" class="btn btn-sm btn-outline add" @click="emit('add')">
      <Icon name="plus" :size="14" />
      新增版本
    </button>
  </div>
</template>

<style scoped>
.route-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  display: inline-flex;
  align-items: stretch;
  max-width: 100%;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  background: var(--surface-2);
  transition: border-color 0.15s var(--ease);
}
.chip:hover {
  border-color: rgb(124 178 255 / 0.6);
}
.chip.active {
  border-color: #3d8bff;
  background: linear-gradient(90deg, rgb(61 139 255 / 0.16), transparent), var(--surface-2);
}
.chip-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 3px 4px 3px 9px;
  border: 0;
  background: none;
  color: var(--text);
  text-align: left;
}
.chip-name {
  max-width: 140px;
  font-size: 12px;
  font-weight: 700;
}
.chip-meta {
  color: var(--text-3);
  font-size: 11px;
}
.chip.active .chip-meta {
  color: #7cb2ff;
}
.chip-del {
  display: grid;
  place-items: center;
  width: 24px;
  border: 0;
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  background: none;
  color: var(--text-3);
}
.chip-del:hover {
  background: var(--danger-soft);
  color: var(--danger);
}
.add {
  height: auto;
  min-height: 30px;
}
</style>
