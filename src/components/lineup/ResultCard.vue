<script setup lang="ts">
import { formatShort } from '@/lib/format'
import { useLineups } from '@/stores/lineups'
import type { Lineup } from '@/types'
import Icon from '@/components/common/Icon.vue'
import TypeBadge from '@/components/common/TypeBadge.vue'
import LineupThumb from './LineupThumb.vue'

/**
 * 导览栏搜索结果卡片：点击卡片在地图上定位，点「详情」进入详情页；
 * 有路径时可以「现场演练」；右上角的小方框隐藏这个 Lineup。
 */
defineProps<{ lineup: Lineup; active?: boolean }>()
const emit = defineEmits<{ focus: []; detail: []; hover: [on: boolean]; rehearse: []; hide: [] }>()
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
        <span v-if="lineup.landing" class="flag" title="有落点参照"><Icon name="target" :size="12" /></span>
      </div>
    </div>
    <div class="actions">
      <button
        v-if="lineup.paths.length"
        type="button"
        class="btn btn-sm btn-outline rehearse"
        title="现场演练"
        @click.stop="emit('rehearse')"
      >
        <Icon name="play" :size="12" />
        演练
      </button>
      <button type="button" class="btn btn-sm btn-outline detail" @click.stop="emit('detail')">
        详情
        <Icon name="chevronRight" :size="14" />
      </button>
    </div>
    <button
      type="button"
      class="hide"
      title="隐藏该Lineup"
      aria-label="隐藏该Lineup"
      @click.stop="emit('hide')"
      @keydown.stop
    >
      <Icon name="minus" :size="11" :stroke="2.6" />
    </button>
  </article>
</template>

<style scoped>
.result {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 25px 7px 7px;
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
  width: 68px;
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
.flag {
  display: inline-flex;
  flex: none;
  color: #7cb2ff;
}
.actions {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}
.actions .btn {
  height: 24px;
  gap: 2px;
  padding: 0 4px 0 8px;
}
.rehearse {
  padding-right: 8px !important;
  gap: 4px !important;
  border-color: rgb(120 251 231 / 0.4);
  color: var(--cyan);
}
.rehearse:hover:not(:disabled) {
  background: var(--cyan-soft);
}
/* 右上角的小方框：隐藏该 Lineup */
.hide {
  position: absolute;
  right: 5px;
  top: 5px;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-xs);
  background: var(--bg-elev);
  color: var(--text-3);
  transition:
    color 0.15s var(--ease),
    border-color 0.15s var(--ease),
    background-color 0.15s var(--ease);
}
.hide:hover,
.hide:focus-visible {
  border-color: rgb(255 92 92 / 0.6);
  background: var(--danger-soft);
  color: var(--danger);
  outline: none;
}
</style>
