<script setup lang="ts">
import { formatShort } from '@/lib/format'
import { useLineups } from '@/stores/lineups'
import type { Lineup } from '@/types'
import Icon from '@/components/common/Icon.vue'
import TypeBadge from '@/components/common/TypeBadge.vue'
import LineupThumb from './LineupThumb.vue'

/** 导览栏搜索结果卡片：点击卡片在地图上定位，点「详情」进入详情页 */
defineProps<{ lineup: Lineup; active?: boolean }>()
const emit = defineEmits<{ focus: []; detail: []; hover: [on: boolean] }>()
const store = useLineups()
</script>

<template>
  <article
    class="result"
    :class="{ active }"
    tabindex="0"
    role="button"
    :aria-label="`在地图上定位：${lineup.name}`"
    @click="emit('focus')"
    @keydown.enter.self="emit('focus')"
    @keydown.space.self.prevent="emit('focus')"
    @pointerenter="emit('hover', true)"
    @pointerleave="emit('hover', false)"
  >
    <div class="thumb-wrap">
      <LineupThumb class="thumb" :image-id="lineup.imageIds[0]" :color="store.typeColor(lineup.typeId)" />
      <span v-if="lineup.imageIds.length > 1" class="img-count tabular">{{ lineup.imageIds.length }}</span>
      <i class="type-bar" :style="{ background: store.typeColor(lineup.typeId) }" />
    </div>
    <div class="info">
      <h3 class="name" :title="lineup.name">{{ lineup.name }}</h3>
      <div class="meta">
        <TypeBadge :type-id="lineup.typeId" size="sm" />
        <span class="date tabular">{{ formatShort(lineup.createdAt) }}</span>
      </div>
    </div>
    <button type="button" class="btn btn-sm btn-outline detail" @click.stop="emit('detail')">
      详情
      <Icon name="chevronRight" :size="14" />
    </button>
  </article>
</template>

<style scoped>
.result {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px 7px 7px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--surface);
  cursor: pointer;
  transition:
    border-color 0.15s var(--ease),
    background-color 0.15s var(--ease);
}
.result:hover {
  border-color: var(--line-strong);
  background: var(--surface-2);
}
.result:focus-visible {
  outline: none;
  border-color: var(--cyan-dim);
}
.result.active {
  border-color: var(--cyan-dim);
  background: linear-gradient(90deg, rgb(120 251 231 / 0.1), transparent 70%), var(--surface-2);
}
.thumb-wrap {
  position: relative;
  flex: none;
  width: 84px;
  height: 52px;
  overflow: hidden;
  border-radius: var(--r-sm);
}
.thumb {
  width: 100%;
  height: 100%;
}
.type-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
}
.img-count {
  position: absolute;
  right: 3px;
  bottom: 3px;
  min-width: 16px;
  padding: 0 4px;
  border-radius: var(--r-xs);
  background: rgb(5 8 11 / 0.75);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 15px;
  text-align: center;
}
.info {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
  min-width: 0;
}
.name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.date {
  flex: none;
  color: var(--text-3);
  font-size: 11px;
}
.detail {
  flex: none;
  gap: 1px;
  padding: 0 4px 0 8px;
}
</style>
