<script setup lang="ts">
import { computed, ref } from 'vue'
import { isTimeActive, type TimeFilter } from '@/lib/filter'
import type { Lineup } from '@/types'
import AgentPicker from '@/components/common/AgentPicker.vue'
import Icon from '@/components/common/Icon.vue'
import MapPicker from '@/components/common/MapPicker.vue'
import TimeFilterPicker from '@/components/common/TimeFilter.vue'
import TypeFilter from '@/components/common/TypeFilter.vue'
import ResultCard from '@/components/lineup/ResultCard.vue'
import BrandMark from '@/components/common/BrandMark.vue'

/** 首页左侧导览栏 */
defineProps<{
  results: Lineup[]
  /** 当前地图 + 英雄下的 Lineup 总数（不含筛选） */
  total: number
  activeId: string | null
  mapCounts: Map<string, number>
  agentCounts: Map<string, number>
  typeCounts: Map<string, number>
}>()
const emit = defineEmits<{
  focus: [id: string]
  detail: [id: string]
  hover: [id: string | null]
  collapse: []
  settings: []
  dictionary: []
}>()

const mapId = defineModel<string>('mapId', { required: true })
const agentId = defineModel<string>('agentId', { required: true })
const query = defineModel<string>('query', { required: true })
const typeIds = defineModel<string[]>('typeIds', { required: true })
const time = defineModel<TimeFilter>('time', { required: true })

const searchInput = ref<HTMLInputElement>()
const filtered = computed(() => !!query.value.trim() || typeIds.value.length > 0 || isTimeActive(time.value))

function clearFilters() {
  query.value = ''
  typeIds.value = []
  time.value = { preset: 'all' }
}

defineExpose({ focusSearch: () => searchInput.value?.focus() })
</script>

<template>
  <aside class="sidebar" aria-label="导览栏">
    <header class="brand">
      <BrandMark />
      <button type="button" class="btn btn-ghost btn-icon btn-sm" title="收起导览栏" aria-label="收起导览栏" @click="emit('collapse')">
        <Icon name="sidebar" :size="18" />
      </button>
    </header>

    <div class="pickers">
      <MapPicker
        :model-value="mapId"
        variant="hero"
        :counts="mapCounts"
        @update:model-value="(v) => v && (mapId = v)"
      />
      <AgentPicker
        :model-value="agentId"
        variant="hero"
        :counts="agentCounts"
        @update:model-value="(v) => v && (agentId = v)"
      />
    </div>

    <div class="search">
      <form class="search-box" role="search" @submit.prevent>
        <Icon name="search" :size="16" class="search-icon" />
        <input
          ref="searchInput"
          v-model="query"
          class="input search-input"
          type="search"
          placeholder="搜索当前地图的 Lineup（名字 / 备注）"
          aria-label="搜索 Lineup"
        />
        <button v-if="query" type="button" class="clear" aria-label="清空搜索" @click="query = ''">
          <Icon name="x" :size="14" />
        </button>
      </form>
      <div class="filters">
        <TimeFilterPicker v-model="time" block />
        <TypeFilter v-model="typeIds" :counts="typeCounts" block />
      </div>
    </div>

    <div class="results-head">
      <span class="eyebrow">Lineups</span>
      <span class="results-count tabular">
        <template v-if="filtered">{{ results.length }} / {{ total }}</template>
        <template v-else>{{ total }}</template>
      </span>
      <button v-if="filtered" type="button" class="link" @click="clearFilters">清除筛选</button>
    </div>

    <div class="results" role="list">
      <ResultCard
        v-for="l in results"
        :key="l.id"
        role="listitem"
        :lineup="l"
        :active="l.id === activeId"
        @focus="emit('focus', l.id)"
        @detail="emit('detail', l.id)"
        @hover="(on) => emit('hover', on ? l.id : null)"
      />
      <div v-if="!results.length" class="empty">
        <template v-if="filtered">
          <Icon name="search" :size="22" />
          <p>没有符合条件的 Lineup</p>
          <button type="button" class="btn btn-sm btn-outline" @click="clearFilters">清除筛选</button>
        </template>
        <template v-else>
          <Icon name="crosshair" :size="24" />
          <p>这张地图还没有记录</p>
          <p class="empty-hint">在右侧地图上<strong>双击</strong>任意位置，<br />即可在该处新建一个 Lineup</p>
        </template>
      </div>
    </div>

    <footer class="foot">
      <button type="button" class="btn btn-ghost foot-btn" @click="emit('settings')">
        <Icon name="settings" :size="17" />
        设置
      </button>
      <button type="button" class="btn btn-outline foot-btn dict" @click="emit('dictionary')">
        <Icon name="book" :size="17" />
        Lineup 字典
      </button>
    </footer>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: var(--sidebar-w);
  height: 100%;
  border-right: 1px solid var(--line);
  background: var(--bg-elev);
}
.brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 12px 12px 16px;
}
.pickers {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 12px;
}
.search {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 12px 10px;
}
.search-box {
  position: relative;
}
.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  color: var(--text-3);
  transform: translateY(-50%);
  pointer-events: none;
}
.search-input {
  padding-left: 32px;
  padding-right: 30px;
}
.search-input::-webkit-search-cancel-button {
  display: none;
}
.clear {
  position: absolute;
  right: 6px;
  top: 50%;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: var(--r-xs);
  background: var(--surface-3);
  color: var(--text-2);
  transform: translateY(-50%);
}
.filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.results-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px 8px;
  border-top: 1px solid var(--line);
  padding-top: 12px;
}
.results-count {
  padding: 0 7px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
}
.link {
  margin-left: auto;
  border: 0;
  background: none;
  color: var(--cyan);
  font-size: 12px;
}
.results {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  padding: 0 12px 12px;
  overflow-y: auto;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 24px;
  padding: 24px 16px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--r);
  color: var(--text-3);
  text-align: center;
}
.empty p {
  color: var(--text-2);
}
.empty .empty-hint {
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.7;
}
.empty strong {
  color: var(--cyan);
}
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--line);
}
.foot-btn {
  height: 36px;
}
.dict {
  border-color: rgb(255 70 85 / 0.45);
  color: #ffd0d4;
}
.dict:hover:not(:disabled) {
  background: var(--accent-soft);
}
</style>
