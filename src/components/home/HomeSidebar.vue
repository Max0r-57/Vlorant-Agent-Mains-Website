<script setup lang="ts">
import { computed, ref } from 'vue'
import { isTimeActive, type TimeFilter } from '@/lib/filter'
import type { Lineup, Position } from '@/types'
import AgentPicker from '@/components/common/AgentPicker.vue'
import Icon from '@/components/common/Icon.vue'
import MapPicker from '@/components/common/MapPicker.vue'
import TimeFilterPicker from '@/components/common/TimeFilter.vue'
import TypeFilter from '@/components/common/TypeFilter.vue'
import ResultCard from '@/components/lineup/ResultCard.vue'
import BrandMark from '@/components/common/BrandMark.vue'
import BackupStatusChip from '@/components/common/BackupStatusChip.vue'

/** 首页左侧导览栏 */
defineProps<{
  results: Lineup[]
  /** 当前地图 + 英雄下的 Lineup 总数（不含筛选） */
  total: number
  activeId: string | null
  mapCounts: Map<string, number>
  agentCounts: Map<string, number>
  typeCounts: Map<string, number>
  /** 正在地图上圈画区域 */
  lassoActive?: boolean
}>()
const emit = defineEmits<{
  focus: [id: string]
  detail: [id: string]
  hover: [id: string | null]
  rehearse: [id: string]
  hide: [id: string]
  /** 点击区域搜索按钮：开始 / 取消在地图上圈画 */
  'area-search': []
  collapse: []
  settings: []
  dictionary: []
}>()

const mapId = defineModel<string>('mapId', { required: true })
const agentId = defineModel<string>('agentId', { required: true })
const query = defineModel<string>('query', { required: true })
const typeIds = defineModel<string[]>('typeIds', { required: true })
const time = defineModel<TimeFilter>('time', { required: true })
/** 区域搜索圈出的范围 */
const area = defineModel<Position[] | null>('area', { required: true })
const hiddenIds = defineModel<string[]>('hiddenIds', { required: true })

const searchInput = ref<HTMLInputElement>()
const filtered = computed(
  () =>
    !!query.value.trim() ||
    typeIds.value.length > 0 ||
    isTimeActive(time.value) ||
    !!area.value ||
    hiddenIds.value.length > 0,
)

function clearFilters() {
  query.value = ''
  typeIds.value = []
  time.value = { preset: 'all' }
  area.value = null
  hiddenIds.value = []
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
      <div class="search-row">
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
        <button
          type="button"
          class="area-btn"
          :class="{ on: lassoActive || !!area }"
          :aria-pressed="lassoActive"
          :title="lassoActive ? '取消圈画' : '区域搜索：在地图上圈出范围，搜索范围内的落点'"
          aria-label="区域搜索"
          @click="emit('area-search')"
        >
          <Icon name="pen" :size="16" />
        </button>
      </div>
      <div class="filters">
        <TimeFilterPicker v-model="time" block />
        <TypeFilter v-model="typeIds" :counts="typeCounts" block />
      </div>
      <div v-if="lassoActive" class="area-chip drawing">
        <Icon name="pen" :size="14" />
        <span class="area-text">在右侧地图上按住左键圈出范围</span>
        <button type="button" class="chip-btn" @click="emit('area-search')">取消</button>
      </div>
      <div v-else-if="area" class="area-chip">
        <Icon name="area" :size="15" />
        <span class="area-text">区域搜索 · 圈内落点 <b class="tabular">{{ results.length }}</b> 个</span>
        <button type="button" class="chip-btn" title="重新圈画" @click="emit('area-search')">重画</button>
        <button type="button" class="chip-btn icon" title="取消区域搜索" aria-label="取消区域搜索" @click="area = null">
          <Icon name="x" :size="13" />
        </button>
      </div>
    </div>

    <div class="results-head">
      <span class="eyebrow">Lineups</span>
      <span class="results-count tabular">
        <template v-if="filtered">{{ results.length }} / {{ total }}</template>
        <template v-else>{{ total }}</template>
      </span>
      <button v-if="hiddenIds.length" type="button" class="hidden-link" title="显示全部隐藏的 Lineup" @click="hiddenIds = []">
        <Icon name="eyeOff" :size="13" />
        已隐藏 {{ hiddenIds.length }}
      </button>
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
        @rehearse="emit('rehearse', l.id)"
        @hide="emit('hide', l.id)"
      />
      <div v-if="!results.length" class="empty">
        <template v-if="filtered">
          <Icon name="search" :size="22" />
          <p>{{ area && !hiddenIds.length ? '圈出的范围内没有落点' : '没有符合条件的 Lineup' }}</p>
          <button type="button" class="btn btn-sm btn-outline" @click="clearFilters">清除筛选</button>
        </template>
        <template v-else>
          <Icon name="crosshair" :size="24" />
          <p>这张地图还没有记录</p>
          <p class="empty-hint">在右侧地图上<strong>双击</strong>任意位置，<br />即可在该处新建一个 Lineup</p>
        </template>
      </div>
    </div>

    <BackupStatusChip />
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
.search-row {
  display: flex;
  gap: 6px;
}
.search-box {
  position: relative;
  flex: 1;
  min-width: 0;
}
/* 区域搜索按钮：正方形小框 + 画笔轮廓 */
.area-btn {
  display: grid;
  flex: none;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--text-2);
  transition:
    border-color 0.15s var(--ease),
    background-color 0.15s var(--ease),
    color 0.15s var(--ease);
}
.area-btn:hover {
  border-color: #3a4e5f;
  color: var(--text);
}
.area-btn.on {
  border-color: var(--cyan-dim);
  background: var(--cyan-soft);
  color: var(--cyan);
}
.area-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 4px 4px 10px;
  border: 1px solid rgb(120 251 231 / 0.35);
  border-radius: var(--r-sm);
  background: var(--cyan-soft);
  color: var(--cyan);
  font-size: 12px;
}
.area-chip.drawing {
  border-style: dashed;
}
.area-text {
  flex: 1;
  min-width: 0;
  color: var(--text-2);
}
.area-text b {
  color: var(--cyan);
}
.chip-btn {
  display: grid;
  place-items: center;
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--r-xs);
  background: transparent;
  color: var(--cyan);
  font-size: 12px;
  font-weight: 600;
}
.chip-btn.icon {
  width: 24px;
  padding: 0;
  color: var(--text-2);
}
.chip-btn:hover {
  background: rgb(120 251 231 / 0.14);
  color: var(--text);
}
.hidden-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-3);
  font-size: 12px;
}
.hidden-link:hover {
  color: var(--text);
}
.hidden-link + .link {
  margin-left: 8px;
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
