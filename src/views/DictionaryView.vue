<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import { AGENT_BY_ID, agentName } from '@/data/agents'
import { MAP_BY_ID, mapName } from '@/data/maps'
import {
  describeTime,
  filterLineups,
  isTimeActive,
  sortLineups,
  type SortDir,
  type SortKey,
  type TimeFilter,
  type TimePreset,
} from '@/lib/filter'
import { formatDateTime, formatShort } from '@/lib/format'
import { useLineups } from '@/stores/lineups'
import { useUi } from '@/stores/ui'
import type { Lineup } from '@/types'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import AgentPicker from '@/components/common/AgentPicker.vue'
import BrandMark from '@/components/common/BrandMark.vue'
import Icon from '@/components/common/Icon.vue'
import MapPicker from '@/components/common/MapPicker.vue'
import TimeFilterPicker from '@/components/common/TimeFilter.vue'
import TypeBadge from '@/components/common/TypeBadge.vue'
import TypeFilter from '@/components/common/TypeFilter.vue'
import LineupThumb from '@/components/lineup/LineupThumb.vue'

/**
 * Lineup 字典：按英雄、地图、关键词、创建时间、类型筛选全部 Lineup，
 * 以类似文件管理器「详细信息」视图的列表展示，点击一行进入详情页。
 * 筛选条件保存在地址栏中，从详情页返回时会保留。
 */
const route = useRoute()
const router = useRouter()
const store = useLineups()
const ui = useUi()

const PRESETS: TimePreset[] = ['all', '7d', '30d', '90d', 'custom']
const SORT_KEYS: SortKey[] = ['name', 'agent', 'map', 'type', 'createdAt']

function str(v: LocationQuery[string]) {
  return typeof v === 'string' ? v : ''
}

// ---------- 从地址栏读取筛选条件 ----------
const agentId = computed(() => (AGENT_BY_ID.has(str(route.query.agent)) ? str(route.query.agent) : null))
const mapId = computed(() => (MAP_BY_ID.has(str(route.query.map)) ? str(route.query.map) : null))
const query = computed(() => str(route.query.q))
const typeIds = computed(() => str(route.query.types).split(',').filter((t) => store.typeById.has(t)))
const time = computed<TimeFilter>(() => {
  const preset = str(route.query.time) as TimePreset
  return {
    preset: PRESETS.includes(preset) ? preset : 'all',
    from: str(route.query.from) || undefined,
    to: str(route.query.to) || undefined,
  }
})
const sortKey = computed<SortKey>(() =>
  SORT_KEYS.includes(str(route.query.sort) as SortKey) ? (str(route.query.sort) as SortKey) : 'createdAt',
)
const sortDir = computed<SortDir>(() =>
  str(route.query.dir) === 'asc' ? 'asc' : str(route.query.dir) === 'desc' ? 'desc' : sortKey.value === 'createdAt' ? 'desc' : 'asc',
)

function update(patch: Record<string, string | null | undefined>) {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...patch })) {
    if (typeof v === 'string' && v) next[k] = v
  }
  router.replace({ query: next })
}

function setTime(t: TimeFilter) {
  update({
    time: t.preset === 'all' ? null : t.preset,
    from: t.preset === 'custom' ? t.from : null,
    to: t.preset === 'custom' ? t.to : null,
  })
}

// 搜索框：输入时实时筛选（稍作延迟），回车或点「搜索」立即生效
const queryInput = ref(query.value)
watch(query, (q) => {
  if (q !== queryInput.value.trim()) queryInput.value = q
})
let queryTimer = 0
watch(queryInput, (v) => {
  window.clearTimeout(queryTimer)
  queryTimer = window.setTimeout(() => update({ q: v.trim() }), 250)
})
function search() {
  window.clearTimeout(queryTimer)
  update({ q: queryInput.value.trim() })
}

const filtered = computed(
  () => !!(agentId.value || mapId.value || query.value || typeIds.value.length || isTimeActive(time.value)),
)

function reset() {
  queryInput.value = ''
  router.replace({ query: {} })
}

// ---------- 结果 ----------
const ctx = { typeName: store.typeName, agentName, mapName }
const results = computed(() =>
  sortLineups(
    filterLineups(
      store.lineups,
      { agentId: agentId.value, mapId: mapId.value, query: query.value, typeIds: typeIds.value, time: time.value },
      ctx,
    ),
    sortKey.value,
    sortDir.value,
    ctx,
  ),
)

const agentCounts = computed(() => {
  const m = new Map<string, number>()
  for (const l of store.lineups) if (!mapId.value || l.mapId === mapId.value) m.set(l.agentId, (m.get(l.agentId) ?? 0) + 1)
  return m
})
const mapCounts = computed(() => {
  const m = new Map<string, number>()
  for (const l of store.lineups) if (!agentId.value || l.agentId === agentId.value) m.set(l.mapId, (m.get(l.mapId) ?? 0) + 1)
  return m
})
const typeCounts = computed(() => {
  const m = new Map<string, number>()
  for (const l of store.lineups) {
    if ((agentId.value && l.agentId !== agentId.value) || (mapId.value && l.mapId !== mapId.value)) continue
    m.set(l.typeId, (m.get(l.typeId) ?? 0) + 1)
  }
  return m
})

const summary = computed(() => {
  const parts: string[] = []
  if (agentId.value) parts.push(agentName(agentId.value))
  if (mapId.value) parts.push(mapName(mapId.value))
  if (typeIds.value.length) parts.push(typeIds.value.map((t) => store.typeName(t)).join('、'))
  if (isTimeActive(time.value)) parts.push(describeTime(time.value))
  if (query.value) parts.push(`“${query.value}”`)
  return parts.join(' · ')
})

const columns: { key: SortKey; label: string }[] = [
  { key: 'name', label: '名称' },
  { key: 'agent', label: '英雄' },
  { key: 'map', label: '地图' },
  { key: 'type', label: '类型' },
  { key: 'createdAt', label: '创建时间' },
]

function sortBy(key: SortKey) {
  if (sortKey.value === key) update({ sort: key, dir: sortDir.value === 'asc' ? 'desc' : 'asc' })
  else update({ sort: key, dir: key === 'createdAt' ? 'desc' : 'asc' })
}

// ---------- 预览栏 ----------
const hovered = ref<Lineup | null>(null)
const preview = computed(() => hovered.value ?? results.value[0] ?? null)

function openImages(l: Lineup) {
  if (!l.imageIds.length) return
  ui.openLightbox(
    l.imageIds.map((id) => ({ kind: 'stored' as const, id })),
    0,
    l.name,
  )
}
</script>

<template>
  <div class="dict-page">
    <header class="topbar">
      <div class="topbar-inner">
        <RouterLink :to="{ name: 'home' }" class="home-link" title="回到地图">
          <BrandMark />
        </RouterLink>
        <span class="divider" />
        <h1>
          <Icon name="book" :size="18" />
          Lineup 字典
        </h1>
        <div class="top-actions">
          <RouterLink :to="{ name: 'home' }" class="btn btn-outline">
            <Icon name="map" :size="16" />
            返回地图
          </RouterLink>
          <button type="button" class="btn btn-ghost btn-icon" title="设置" aria-label="设置" @click="ui.settingsOpen = true">
            <Icon name="settings" :size="18" />
          </button>
        </div>
      </div>
    </header>

    <section class="filters">
      <div class="filters-inner">
        <AgentPicker
          :model-value="agentId"
          allow-all
          :counts="agentCounts"
          @update:model-value="(v) => update({ agent: v })"
        />
        <MapPicker
          :model-value="mapId"
          allow-all
          :counts="mapCounts"
          @update:model-value="(v) => update({ map: v })"
        />
        <form class="search-box" role="search" @submit.prevent="search">
          <Icon name="search" :size="16" class="search-icon" />
          <input
            v-model="queryInput"
            class="input"
            type="search"
            placeholder="搜索名字、备注、类型…"
            aria-label="搜索 Lineup"
          />
        </form>
        <TimeFilterPicker :model-value="time" @update:model-value="setTime" />
        <TypeFilter
          :model-value="typeIds"
          :counts="typeCounts"
          @update:model-value="(v) => update({ types: v.join(',') })"
        />
        <button type="button" class="btn btn-primary" @click="search">
          <Icon name="search" :size="16" />
          搜索
        </button>
        <button v-if="filtered" type="button" class="btn btn-ghost" @click="reset">
          <Icon name="refresh" :size="15" />
          重置
        </button>
      </div>
    </section>

    <main class="main">
      <div class="list-wrap">
        <div class="summary">
          <span>
            共 <b class="tabular">{{ results.length }}</b> 个 Lineup
            <template v-if="filtered && store.lineups.length !== results.length">
              （全部 {{ store.lineups.length }}）
            </template>
          </span>
          <span v-if="summary" class="summary-filters ellipsis">{{ summary }}</span>
        </div>

        <div class="table" role="table" aria-label="Lineup 列表">
          <div class="row head" role="row">
            <button
              v-for="c in columns"
              :key="c.key"
              type="button"
              class="cell th"
              :class="[`col-${c.key}`, { sorted: sortKey === c.key }]"
              role="columnheader"
              :aria-sort="sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'"
              @click="sortBy(c.key)"
            >
              {{ c.label }}
              <Icon
                v-if="sortKey === c.key"
                :name="sortDir === 'asc' ? 'arrowUp' : 'arrowDown'"
                :size="13"
              />
            </button>
          </div>

          <RouterLink
            v-for="l in results"
            :key="l.id"
            :to="{ name: 'lineup', params: { id: l.id } }"
            class="row item"
            role="row"
            @pointerenter="hovered = l"
            @focus="hovered = l"
          >
            <span class="cell col-name" role="cell">
              <span class="icon-thumb">
                <LineupThumb :image-id="l.imageIds[0]" :color="store.typeColor(l.typeId)" />
              </span>
              <span class="name ellipsis">{{ l.name }}</span>
              <span v-if="l.imageIds.length > 1" class="img-count tabular" :title="`${l.imageIds.length} 张图片`">
                <Icon name="image" :size="11" />{{ l.imageIds.length }}
              </span>
            </span>
            <span class="cell col-agent" role="cell">
              <AgentAvatar :agent-id="l.agentId" :size="20" />
              <span class="ellipsis">{{ agentName(l.agentId) }}</span>
            </span>
            <span class="cell col-map ellipsis" role="cell">{{ mapName(l.mapId) }}</span>
            <span class="cell col-type" role="cell"><TypeBadge :type-id="l.typeId" size="sm" /></span>
            <span class="cell col-createdAt tabular" role="cell">
              <span class="date-full">{{ formatDateTime(l.createdAt) }}</span>
              <span class="date-short">{{ formatShort(l.createdAt) }}</span>
            </span>
          </RouterLink>

          <div v-if="!results.length" class="empty">
            <template v-if="store.lineups.length">
              <Icon name="search" :size="24" />
              <p>没有符合条件的 Lineup</p>
              <button type="button" class="btn btn-sm btn-outline" @click="reset">清除全部筛选</button>
            </template>
            <template v-else>
              <Icon name="crosshair" :size="26" />
              <p>字典还是空的</p>
              <p class="hint">回到地图，在想要记录的位置<b>双击</b>即可新建第一个 Lineup。</p>
              <RouterLink :to="{ name: 'home' }" class="btn btn-sm btn-primary">去地图新建</RouterLink>
            </template>
          </div>
        </div>
      </div>

      <aside v-if="preview" class="preview" aria-label="预览">
        <span class="eyebrow">预览</span>
        <button
          type="button"
          class="preview-cover"
          :disabled="!preview.imageIds.length"
          title="查看大图"
          @click="openImages(preview)"
        >
          <LineupThumb :image-id="preview.imageIds[0]" :color="store.typeColor(preview.typeId)" :alt="preview.name" />
        </button>
        <h2 class="preview-name">{{ preview.name }}</h2>
        <div class="preview-meta">
          <TypeBadge :type-id="preview.typeId" />
          <span><AgentAvatar :agent-id="preview.agentId" :size="18" /> {{ agentName(preview.agentId) }}</span>
          <span>{{ mapName(preview.mapId) }}</span>
        </div>
        <p v-if="preview.note" class="preview-note">{{ preview.note }}</p>
        <p v-else class="preview-note empty-note">（没有备注）</p>
        <RouterLink :to="{ name: 'lineup', params: { id: preview.id } }" class="btn btn-outline btn-block">
          打开详情
          <Icon name="chevronRight" :size="15" />
        </RouterLink>
      </aside>
    </main>
  </div>
</template>

<style scoped>
.dict-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.topbar {
  flex: none;
  border-bottom: 1px solid var(--line);
  background: var(--bg-elev);
}
.topbar-inner {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 58px;
  padding: 0 20px;
}
.home-link {
  display: flex;
  color: inherit;
}
.divider {
  width: 1px;
  height: 24px;
  background: var(--line-strong);
}
.topbar h1 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.04em;
}
.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.filters {
  flex: none;
  border-bottom: 1px solid var(--line);
  background: linear-gradient(180deg, var(--bg-elev), var(--bg));
}
.filters-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
}
.search-box {
  position: relative;
  flex: 1 1 260px;
  max-width: 440px;
}
.search-box .input {
  padding-left: 32px;
}
.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  color: var(--text-3);
  transform: translateY(-50%);
  pointer-events: none;
}

.main {
  display: flex;
  flex: 1;
  gap: 16px;
  min-height: 0;
  padding: 14px 20px 20px;
}
.list-wrap {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.summary {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 0 4px 10px;
  color: var(--text-2);
  font-size: 13px;
}
.summary b {
  color: var(--text);
}
.summary-filters {
  color: var(--cyan);
  font-size: 12px;
}

.table {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--bg-elev);
}
.row {
  display: grid;
  grid-template-columns: minmax(220px, 3fr) minmax(110px, 1fr) minmax(100px, 1fr) minmax(110px, 1fr) minmax(150px, 1.1fr);
  align-items: center;
  min-width: 720px;
}
.head {
  position: sticky;
  top: 0;
  z-index: 1;
  border-bottom: 1px solid var(--line-strong);
  background: var(--surface);
}
.cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0 14px;
}
.th {
  height: 38px;
  border: 0;
  background: transparent;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-align: left;
}
.th:hover {
  background: var(--surface-2);
  color: var(--text);
}
.th.sorted {
  color: var(--cyan);
}
.item {
  min-height: 48px;
  border-bottom: 1px solid var(--line);
  color: var(--text);
  transition: background-color 0.12s var(--ease);
}
.item:last-of-type {
  border-bottom: 0;
}
.item:hover,
.item:focus-visible {
  background: var(--surface-2);
  outline: none;
}
.item:focus-visible {
  box-shadow: inset 3px 0 0 var(--cyan);
}
.col-name {
  font-weight: 600;
}
.icon-thumb {
  flex: none;
  width: 48px;
  height: 30px;
  overflow: hidden;
  border-radius: var(--r-xs);
  box-shadow: 0 0 0 1px var(--line-strong);
}
.icon-thumb .thumb {
  width: 100%;
  height: 100%;
}
.img-count {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 2px;
  color: var(--text-3);
  font-size: 11px;
  font-weight: 500;
}
.col-agent,
.col-map,
.col-createdAt {
  color: var(--text-2);
  font-size: 13px;
}
.date-short {
  display: none;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 64px 16px;
  color: var(--text-3);
  text-align: center;
}
.empty p {
  color: var(--text-2);
}
.empty .hint {
  color: var(--text-3);
  font-size: 13px;
}
.empty b {
  color: var(--cyan);
}

.preview {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 10px;
  width: 320px;
  padding: 16px;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--bg-elev);
}
.preview-cover {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: var(--r);
  background: none;
  cursor: zoom-in;
}
.preview-cover:disabled {
  cursor: default;
}
.preview-cover .thumb {
  width: 100%;
  height: 100%;
}
.preview-name {
  font-size: 17px;
  font-weight: 800;
  line-height: 1.35;
}
.preview-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  color: var(--text-2);
  font-size: 13px;
}
.preview-meta span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.preview-note {
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-line;
}
.empty-note {
  color: var(--text-3);
}

@media (max-width: 1200px) {
  .preview {
    display: none;
  }
}
@media (max-width: 760px) {
  .topbar-inner {
    gap: 10px;
    padding: 0 12px;
  }
  .divider,
  .home-link {
    display: none;
  }
  .filters-inner,
  .main {
    padding-left: 12px;
    padding-right: 12px;
  }
  .row {
    grid-template-columns: minmax(0, 1fr) auto auto;
    min-width: 0;
  }
  .cell {
    padding: 0 10px;
  }
  .col-map,
  .col-type,
  .col-agent .ellipsis,
  .date-full {
    display: none;
  }
  .date-short {
    display: inline;
  }
  .summary {
    flex-direction: column;
    gap: 2px;
  }
}
</style>
