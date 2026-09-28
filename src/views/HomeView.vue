<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { AGENT_BY_ID } from '@/data/agents'
import { MAPS, MAP_BY_ID } from '@/data/maps'
import { useLayer } from '@/composables/useLayer'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { useMarkerPopover } from '@/composables/useMarkerPopover'
import { filterLineups, sortLineups } from '@/lib/filter'
import { groupByPosition, posKey, type MarkerGroup } from '@/lib/positions'
import { useHomeFilters } from '@/stores/homeFilters'
import { useLineups } from '@/stores/lineups'
import { MARKER_PX, usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import type { Lineup, Position } from '@/types'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import Icon from '@/components/common/Icon.vue'
import HomeSidebar from '@/components/home/HomeSidebar.vue'
import CreateLineupPanel from '@/components/lineup/CreateLineupPanel.vue'
import MapCanvas from '@/components/map/MapCanvas.vue'
import MapMarker from '@/components/map/MapMarker.vue'
import MarkerPopover from '@/components/map/MarkerPopover.vue'

defineOptions({ name: 'HomeView' })

const store = useLineups()
const { prefs } = usePrefs()
const ui = useUi()
const router = useRouter()
const route = useRoute()
const filters = useHomeFilters()
const { query, typeIds, time } = storeToRefs(filters)

const canvas = ref<InstanceType<typeof MapCanvas>>()
const sidebar = ref<InstanceType<typeof HomeSidebar>>()

const map = computed(() => MAP_BY_ID.get(prefs.mapId) ?? MAPS[0]!)
const agent = computed(() => AGENT_BY_ID.get(prefs.agentId))
const markerPx = computed(() => MARKER_PX[prefs.markerSize])

// ---------- 数据 ----------
/** 当前地图 + 当前英雄的全部 Lineup */
const scoped = computed(() =>
  store.lineups.filter((l) => l.mapId === prefs.mapId && l.agentId === prefs.agentId),
)
const results = computed(() =>
  sortLineups(
    filterLineups(scoped.value, { query: query.value, typeIds: typeIds.value, time: time.value }, { typeName: store.typeName }),
    'createdAt',
    'desc',
  ),
)
const groups = computed(() => groupByPosition(results.value))
const groupByKey = computed(() => new Map(groups.value.map((g) => [g.key, g])))

const mapCounts = computed(() => {
  const m = new Map<string, number>()
  for (const l of store.lineups) if (l.agentId === prefs.agentId) m.set(l.mapId, (m.get(l.mapId) ?? 0) + 1)
  return m
})
const agentCounts = computed(() => {
  const m = new Map<string, number>()
  for (const l of store.lineups) if (l.mapId === prefs.mapId) m.set(l.agentId, (m.get(l.agentId) ?? 0) + 1)
  return m
})
const typeCounts = computed(() => {
  const m = new Map<string, number>()
  for (const l of scoped.value) m.set(l.typeId, (m.get(l.typeId) ?? 0) + 1)
  return m
})

function markerVariant(g: MarkerGroup<Lineup>) {
  return g.items.length > 1 ? 'stack' : 'single'
}

// ---------- 预览窗口 ----------
const pop = useMarkerPopover()
const viewTick = ref(0)
const hoverResultKey = ref<string | null>(null)
const activeId = ref<string | null>(null)
const highlightKey = ref<string | null>(null)
let highlightTimer = 0

const popGroup = computed(() => (pop.state.value ? groupByKey.value.get(pop.state.value.key) : undefined))
const popAnchor = computed(() => {
  void viewTick.value
  const g = popGroup.value
  if (!g || !canvas.value) return null
  if (!canvas.value.isPosVisible(g, 4)) return null
  return canvas.value.posToClient(g)
})

useLayer(() => !!pop.state.value, pop.close)

function highlight(key: string) {
  highlightKey.value = null
  window.clearTimeout(highlightTimer)
  requestAnimationFrame(() => {
    highlightKey.value = key
    highlightTimer = window.setTimeout(() => (highlightKey.value = null), 2800)
  })
}

/** 点击搜索结果：在地图上定位并弹出预览 */
function focusLineup(id: string) {
  const g = groups.value.find((gr) => gr.items.some((l) => l.id === id))
  if (!g) return
  activeId.value = id
  canvas.value?.focusOn(g)
  pop.pin(g.key, id)
  highlight(g.key)
  if (window.matchMedia('(max-width: 900px)').matches) prefs.sidebarOpen = false
}

function openDetail(id: string) {
  router.push({ name: 'lineup', params: { id } })
}

function onMarkerEnter(e: PointerEvent, key: string) {
  if (e.pointerType === 'mouse' && !creating.value) pop.hoverEnter(key)
}
function onMarkerLeave(e: PointerEvent) {
  if (e.pointerType === 'mouse') pop.hoverLeave()
}
function onMarkerClick(key: string) {
  // 新建面板打开时不弹出预览（双击圆点 = 在相同位置新建）
  if (!creating.value) pop.toggle(key)
}

// ---------- 新建 ----------
interface CreateState {
  pos: Position
  anchor: { x: number; y: number }
  stackCount: number
}
const creating = ref<CreateState | null>(null)

function countAt(pos: Position) {
  return scoped.value.filter((l) => l.x === pos.x && l.y === pos.y).length
}

function openCreate(pos: Position, anchor: { x: number; y: number }) {
  pop.close()
  const next = { pos, anchor, stackCount: countAt(pos) }
  // 面板已打开时只移动位置，保留已填写的内容
  creating.value = creating.value ? { ...creating.value, ...next } : next
}

function onMapDblClick(payload: { pos: Position; clientX: number; clientY: number }) {
  openCreate(payload.pos, { x: payload.clientX, y: payload.clientY })
}

function createAt(g: MarkerGroup) {
  const pos = { x: g.x, y: g.y }
  openCreate(pos, canvas.value?.posToClient(pos) ?? { x: innerWidth / 2, y: innerHeight / 2 })
}

function onSaved(lineup: Lineup) {
  creating.value = null
  activeId.value = lineup.id
  const visible = results.value.some((l) => l.id === lineup.id)
  if (visible) {
    ui.toast(`已保存「${lineup.name}」`)
    highlight(posKey(lineup))
  } else {
    ui.toast(`已保存「${lineup.name}」，但不符合当前筛选条件`, {
      kind: 'info',
      action: { label: '清除筛选', run: () => filters.clear() },
    })
  }
}

function onBackgroundClick() {
  pop.close()
}

// 切换地图 / 英雄时关闭浮层
watch(
  () => [prefs.mapId, prefs.agentId],
  () => {
    pop.close()
    creating.value = null
    activeId.value = null
  },
)

onDeactivated(() => {
  pop.close()
  creating.value = null
})

// 从详情页「在首页地图中查看」跳转过来：切换到对应地图 / 英雄并定位
watch(
  () => route.query.focus,
  async (fid) => {
    if (typeof fid !== 'string' || !fid) return
    router.replace({ name: 'home' })
    const l = store.lineupById.get(fid)
    if (!l) return
    prefs.mapId = l.mapId
    prefs.agentId = l.agentId
    await nextTick()
    if (!results.value.some((r) => r.id === fid)) filters.clear()
    await nextTick()
    requestAnimationFrame(() => focusLineup(fid))
  },
  { immediate: true },
)

// 按 / 聚焦搜索框
function onKeydown(e: KeyboardEvent) {
  if (e.key !== '/' || e.ctrlKey || e.metaKey) return
  const t = e.target as HTMLElement
  if (t.closest('input, textarea, [contenteditable]')) return
  e.preventDefault()
  prefs.sidebarOpen = true
  requestAnimationFrame(() => sidebar.value?.focusSearch())
}
// 首页被 KeepAlive 缓存：只在显示时监听
onActivated(() => window.addEventListener('keydown', onKeydown))
onDeactivated(() => window.removeEventListener('keydown', onKeydown))

const narrow = useMediaQuery('(max-width: 640px)')
const mapPadding = computed(() =>
  narrow.value ? { top: 72, right: 12, bottom: 64, left: 12 } : { top: 76, right: 72, bottom: 40, left: 40 },
)
</script>

<template>
  <div class="home" :class="{ 'sidebar-open': prefs.sidebarOpen }">
    <div class="sidebar-wrap">
      <HomeSidebar
        ref="sidebar"
        v-model:map-id="prefs.mapId"
        v-model:agent-id="prefs.agentId"
        v-model:query="query"
        v-model:type-ids="typeIds"
        v-model:time="time"
        :results="results"
        :total="scoped.length"
        :active-id="activeId"
        :map-counts="mapCounts"
        :agent-counts="agentCounts"
        :type-counts="typeCounts"
        @focus="focusLineup"
        @detail="openDetail"
        @hover="(id) => (hoverResultKey = id ? posKey(store.lineupById.get(id)!) : null)"
        @collapse="prefs.sidebarOpen = false"
        @settings="ui.settingsOpen = true"
        @dictionary="router.push({ name: 'dict' })"
      />
    </div>
    <div class="sidebar-backdrop" @click="prefs.sidebarOpen = false" />

    <main class="map-area">
      <MapCanvas
        ref="canvas"
        :src="map.image"
        :view-key="map.id"
        :padding="mapPadding"
        @map-dblclick="onMapDblClick"
        @background-click="onBackgroundClick"
        @view-change="viewTick++"
      >
        <template #background>
          <img
            v-if="prefs.showPortrait && agent?.portrait"
            :key="agent.id"
            class="portrait"
            :src="agent.portrait"
            alt=""
            draggable="false"
          />
        </template>

        <template #default="{ at }">
          <MapMarker
            v-for="g in groups"
            :key="g.key"
            :style="at(g)"
            :variant="markerVariant(g)"
            :color="store.typeColor(g.items[0]!.typeId)"
            :count="g.items.length"
            :size="markerPx"
            :highlight="highlightKey === g.key"
            :selected="pop.state.value?.key === g.key || hoverResultKey === g.key"
            :label="g.items.length > 1 ? `此位置有 ${g.items.length} 个 Lineup` : g.items[0]!.name"
            @pointerenter="onMarkerEnter($event, g.key)"
            @pointerleave="onMarkerLeave"
            @click="onMarkerClick(g.key)"
            @dblclick.stop="createAt(g)"
          />
          <MapMarker v-if="creating" variant="pending" :style="at(creating.pos)" color="#ff4655" :size="markerPx" />
        </template>

        <template #overlay>
          <div class="hud hud-top" data-map-ui>
            <button
              v-if="!prefs.sidebarOpen"
              type="button"
              class="btn btn-icon hud-btn"
              title="展开导览栏"
              aria-label="展开导览栏"
              @click="prefs.sidebarOpen = true"
            >
              <Icon name="sidebar" :size="18" />
            </button>
            <div class="title">
              <h1>
                {{ map.name }}
                <small v-if="map.en">{{ map.en }}</small>
              </h1>
              <p class="subtitle">
                <AgentAvatar :agent-id="prefs.agentId" :size="18" />
                {{ agent?.name }}
                <span class="dot-sep" />
                <template v-if="filters.active">显示 {{ results.length }} / {{ scoped.length }} 个 Lineup</template>
                <template v-else>{{ scoped.length }} 个 Lineup</template>
                <button v-if="filters.active" type="button" class="link" @click="filters.clear()">清除筛选</button>
              </p>
            </div>
          </div>

          <div v-if="!prefs.hintDismissed" class="hud hud-hint" data-map-ui>
            <Icon name="info" :size="15" />
            <span><b>双击</b>地图新建 Lineup · 滚轮缩放 · 拖动平移 · 悬停圆点预览</span>
            <button type="button" class="hint-close" aria-label="不再提示" @click="prefs.hintDismissed = true">
              <Icon name="x" :size="13" />
            </button>
          </div>

          <div class="hud hud-zoom" data-map-ui>
            <button type="button" class="btn btn-icon hud-btn" title="放大" aria-label="放大" @click="canvas?.zoomBy(1.5)">
              <Icon name="plus" :size="18" />
            </button>
            <button type="button" class="btn btn-icon hud-btn" title="缩小" aria-label="缩小" @click="canvas?.zoomBy(1 / 1.5)">
              <Icon name="minus" :size="18" />
            </button>
            <button type="button" class="btn btn-icon hud-btn" title="适应窗口" aria-label="适应窗口" @click="canvas?.resetView()">
              <Icon name="fit" :size="17" />
            </button>
          </div>
        </template>
      </MapCanvas>
    </main>

    <MarkerPopover
      v-if="popGroup && popAnchor && !creating"
      :lineups="popGroup.items"
      :anchor="popAnchor"
      :radius="markerPx / 2 + 4"
      :focus-id="pop.state.value?.focusId"
      @enter="pop.popoverEnter()"
      @leave="pop.popoverLeave()"
      @detail="openDetail"
      @create-same="createAt(popGroup)"
    />

    <CreateLineupPanel
      v-if="creating"
      :anchor="creating.anchor"
      :pos="creating.pos"
      :map-id="prefs.mapId"
      :agent-id="prefs.agentId"
      :stack-count="creating.stackCount"
      @saved="onSaved"
      @cancel="creating = null"
    />
  </div>
</template>

<style scoped>
.home {
  position: relative;
  display: flex;
  height: 100%;
  overflow: hidden;
}
.sidebar-wrap {
  position: relative;
  z-index: var(--z-sidebar);
  flex: none;
  width: var(--sidebar-w);
  height: 100%;
  transition: margin-left 0.25s var(--ease);
}
.home:not(.sidebar-open) .sidebar-wrap {
  margin-left: calc(-1 * var(--sidebar-w));
}
.sidebar-backdrop {
  display: none;
}
.map-area {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
}

.portrait {
  position: absolute;
  right: -2%;
  bottom: -6%;
  height: 92%;
  max-width: none;
  opacity: 0.11;
  pointer-events: none;
  mask-image: linear-gradient(180deg, #000 55%, transparent 95%);
  filter: saturate(0.6);
}

.hud {
  position: absolute;
  z-index: var(--z-map-hud);
}
.hud-top {
  left: 16px;
  top: 14px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  pointer-events: none;
}
.hud-top > * {
  pointer-events: auto;
}
.title h1 {
  font-size: 26px;
  font-weight: 900;
  letter-spacing: 0.06em;
  line-height: 1.15;
  text-shadow: 0 2px 12px rgb(0 0 0 / 0.8);
}
.title h1 small {
  margin-left: 8px;
  color: var(--cyan);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}
.subtitle {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  color: var(--text-2);
  font-size: 13px;
}
.dot-sep {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--text-3);
}
.link {
  border: 0;
  background: none;
  color: var(--cyan);
  font-size: 12px;
}
.hud-btn {
  --btn-bg: rgb(18 27 34 / 0.85);
  backdrop-filter: blur(6px);
}
.hud-hint {
  left: 16px;
  bottom: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 180px);
  padding: 6px 6px 6px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: rgb(13 20 25 / 0.85);
  backdrop-filter: blur(6px);
  color: var(--text-2);
  font-size: 12px;
}
.hud-hint b {
  color: var(--cyan);
}
.hint-close {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: var(--r-xs);
  background: transparent;
  color: var(--text-3);
}
.hint-close:hover {
  background: var(--surface-3);
  color: var(--text);
}
.hud-zoom {
  right: 16px;
  bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

@media (max-width: 900px) {
  .sidebar-wrap {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    max-width: 88vw;
    transition: transform 0.25s var(--ease);
  }
  .home:not(.sidebar-open) .sidebar-wrap {
    margin-left: 0;
    transform: translateX(-100%);
  }
  .home.sidebar-open .sidebar-backdrop {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-sidebar) - 1);
    display: block;
    background: rgb(3 6 9 / 0.5);
  }
  .title h1 {
    font-size: 20px;
  }
  .hud-hint,
  .portrait {
    display: none;
  }
}
</style>
