<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { AGENT_BY_ID } from '@/data/agents'
import { landingSpec } from '@/data/landing'
import { MAPS, MAP_BY_ID, mapWidthMeters } from '@/data/maps'
import { useLayer } from '@/composables/useLayer'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { useMarkerPopover } from '@/composables/useMarkerPopover'
import { createPathEditor } from '@/composables/usePathEditor'
import { pickPathAt, usePathDrawing, useStroke } from '@/composables/usePathDrawing'
import { usePointerDrag } from '@/composables/usePointerDrag'
import { useRehearsal } from '@/composables/useRehearsal'
import { filterLineups, sortLineups } from '@/lib/filter'
import { boundsOf, mapMetric, polygonArea, roundPos, simplifyPath } from '@/lib/geometry'
import { groupByPosition, posKey, type MarkerGroup } from '@/lib/positions'
import { useHomeFilters } from '@/stores/homeFilters'
import { useLineups } from '@/stores/lineups'
import { MARKER_PX, usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import { POS_MAX, type Landing, type Lineup, type LineupPath, type Position } from '@/types'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import Icon from '@/components/common/Icon.vue'
import HomeSidebar from '@/components/home/HomeSidebar.vue'
import CreateLineupPanel from '@/components/lineup/CreateLineupPanel.vue'
import PathEditorPanel from '@/components/lineup/PathEditorPanel.vue'
import AreaLayer from '@/components/map/AreaLayer.vue'
import LandingCountdown from '@/components/map/LandingCountdown.vue'
import LandingMarker from '@/components/map/LandingMarker.vue'
import MapCanvas, { type ViewState } from '@/components/map/MapCanvas.vue'
import MapMarker from '@/components/map/MapMarker.vue'
import MarkerPopover from '@/components/map/MarkerPopover.vue'
import PathLayer from '@/components/map/PathLayer.vue'
import RehearsalControls from '@/components/map/RehearsalControls.vue'
import RehearsalDot from '@/components/map/RehearsalDot.vue'
import RehearsalTimers from '@/components/map/RehearsalTimers.vue'

defineOptions({ name: 'HomeView' })

const store = useLineups()
const { prefs } = usePrefs()
const ui = useUi()
const router = useRouter()
const route = useRoute()
const filters = useHomeFilters()
const { query, typeIds, time, area, hiddenIds } = storeToRefs(filters)

const canvas = ref<InstanceType<typeof MapCanvas>>()
const sidebar = ref<InstanceType<typeof HomeSidebar>>()
const createPanel = ref<InstanceType<typeof CreateLineupPanel>>()

const map = computed(() => MAP_BY_ID.get(prefs.mapId) ?? MAPS[0]!)
const agent = computed(() => AGENT_BY_ID.get(prefs.agentId))
const markerPx = computed(() => MARKER_PX[prefs.markerSize])
/** 地图比例尺：图片宽度对应的米数 */
const widthMeters = computed(() => mapWidthMeters(map.value.id))
const metric = computed(() => mapMetric(widthMeters.value, canvas.value?.aspect ?? 1))
const narrow = useMediaQuery('(max-width: 640px)')
/** 导览栏是浮在地图上的抽屉（小屏幕） */
const drawerSidebar = useMediaQuery('(max-width: 900px)')

/**
 * 地图的交互模式：
 * normal 浏览 / 新建；lasso 圈画搜索；paths 编辑新建 Lineup 的路径；rehearsal 现场演练
 */
type Mode = 'normal' | 'lasso' | 'paths' | 'rehearsal'
const mode = ref<Mode>('normal')

// ---------- 数据 ----------
/** 当前地图 + 当前英雄的全部 Lineup */
const scoped = computed(() =>
  store.lineups.filter((l) => l.mapId === prefs.mapId && l.agentId === prefs.agentId),
)
const results = computed(() =>
  sortLineups(
    filterLineups(
      scoped.value,
      {
        query: query.value,
        typeIds: typeIds.value,
        time: time.value,
        area: area.value,
        areaBy: prefs.areaSearchBy,
        excludeIds: hiddenIds.value,
      },
      { typeName: store.typeName },
    ),
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

/** 英雄的落点图案在屏幕上的直径（像素）；没有技能范围的英雄为 null（显示通用落点标记） */
function landingDiameter(agentId: string, mapW: number) {
  const spec = landingSpec(agentId)
  return spec ? (spec.diameter / widthMeters.value) * mapW : null
}
function landingColor(agentId: string) {
  return landingSpec(agentId)?.color
}

// ---------- 预览窗口 ----------
const pop = useMarkerPopover()
const viewTick = ref(0)
const hoverResultKey = ref<string | null>(null)
/**
 * 选中的 Lineup：点击圆点或搜索结果时选中。点击地图空白处只收起预览卡片，
 * 选中状态保留，地图上继续显示它的站位、落点和路径，直到点左下角「取消选中」。
 */
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
/** 预览窗口当前显示的 Lineup：在地图上同时显示它的落点和路径 */
const previewId = ref<string | null>(null)
/** 选中的 Lineup（被搜索条件隐藏时不显示） */
const selectedLineup = computed(() => {
  if (!activeId.value || (mode.value !== 'normal' && mode.value !== 'lasso')) return null
  return results.value.find((l) => l.id === activeId.value) ?? null
})
const selectedKey = computed(() => (selectedLineup.value ? posKey(selectedLineup.value) : null))
const previewLineup = computed(() => {
  const g = popGroup.value
  if (!g || mode.value !== 'normal' || creating.value || !popAnchor.value) return null
  const l = g.items.find((item) => item.id === previewId.value) ?? g.items[0] ?? null
  // 选中的 Lineup 已经单独显示
  return l && l.id !== selectedLineup.value?.id ? l : null
})
/** 按落点圈画搜索时，显示结果的落点 */
const areaLandings = computed(() =>
  area.value && prefs.areaSearchBy === 'landing' && mode.value !== 'rehearsal'
    ? results.value.filter(
        (l) => l.landing && l.id !== previewLineup.value?.id && l.id !== selectedLineup.value?.id,
      )
    : [],
)

useLayer(() => !!pop.state.value, pop.close)

/** 预览卡片切换到另一张（同一位置有多个 Lineup 时左右滑动）：固定的卡片同时改变选中 */
function onPopoverCurrent(id: string) {
  previewId.value = id
  if (pop.state.value?.pinned) activeId.value = id
}

function clearSelection() {
  activeId.value = null
  pop.close()
}

/** 重新打开选中 Lineup 的预览卡片 */
function reopenSelected() {
  const l = selectedLineup.value
  if (!l) return
  canvas.value?.focusOn(l)
  pop.pin(posKey(l), l.id)
}

// 收起预览卡片后，Esc 取消选中
useLayer(() => !!selectedLineup.value && !pop.state.value && mode.value === 'normal', clearSelection)

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
  if (mode.value === 'rehearsal') endRehearsal(false)
  if (mode.value === 'lasso') cancelLasso()
  if (mode.value !== 'normal') return
  const g = groups.value.find((gr) => gr.items.some((l) => l.id === id))
  if (!g) return
  activeId.value = id
  canvas.value?.focusOn(g)
  pop.pin(g.key, id)
  highlight(g.key)
  if (drawerSidebar.value) prefs.sidebarOpen = false
}

function openDetail(id: string) {
  router.push({ name: 'lineup', params: { id } })
}

function onMarkerEnter(e: PointerEvent, key: string) {
  if (e.pointerType === 'mouse' && !creating.value && mode.value === 'normal') pop.hoverEnter(key)
}
function onMarkerLeave(e: PointerEvent) {
  if (e.pointerType === 'mouse') pop.hoverLeave()
}
function onMarkerClick(key: string) {
  // 新建面板打开时不弹出预览（双击圆点 = 在相同位置新建）
  if (creating.value || mode.value !== 'normal') return
  pop.toggle(key)
  // 固定了预览卡片：选中卡片上显示的 Lineup（再次点击同一个圆点只收起卡片，保持选中）
  const state = pop.state.value
  const g = groupByKey.value.get(key)
  if (!state?.pinned || !g) return
  const shown = g.items.find((l) => l.id === previewId.value) ?? g.items.find((l) => l.id === state.focusId)
  activeId.value = (shown ?? g.items[0]!).id
}

/** 隐藏某个 Lineup（地图和搜索结果中都不再显示） */
function hideLineup(id: string) {
  if (!hiddenIds.value.includes(id)) hiddenIds.value = [...hiddenIds.value, id]
  if (activeId.value === id) activeId.value = null
  hoverResultKey.value = null
}

// ---------- 新建 ----------
interface CreateState {
  pos: Position
  anchor: { x: number; y: number }
  stackCount: number
  /** 落点参照（未开启时为 null） */
  landing: Landing | null
  paths: LineupPath[]
  showPaths: boolean
}
const creating = ref<CreateState | null>(null)

function countAt(pos: Position) {
  return scoped.value.filter((l) => l.x === pos.x && l.y === pos.y).length
}

function openCreate(pos: Position, anchor: { x: number; y: number }) {
  if (mode.value !== 'normal') return
  pop.close()
  const next = { pos, anchor, stackCount: countAt(pos) }
  // 面板已打开时只移动位置，保留已填写的内容
  creating.value = creating.value
    ? { ...creating.value, ...next }
    : { ...next, landing: null, paths: [], showPaths: true }
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

/** 落点的初始位置：地图可视区域的中间；被新建面板挡住时，放到面板旁边空间较大的一侧 */
function landingStartPos(): Position {
  const cv = canvas.value
  if (!cv) return { x: POS_MAX / 2, y: POS_MAX / 2 }
  const center = cv.centerPos()
  const panel = createPanel.value?.rect()
  if (!panel) return center
  const c = cv.posToClient(center)
  const pad = 40
  if (c.x < panel.left - pad || c.x > panel.right + pad || c.y < panel.top - pad || c.y > panel.bottom + pad) {
    return center
  }
  // 可见的地图范围：视口和地图图片的交集
  const vp = (cv.$el as HTMLElement).getBoundingClientRect()
  const left = Math.max(vp.left, cv.posToClient({ x: 0, y: 0 }).x)
  const right = Math.min(vp.right, cv.posToClient({ x: POS_MAX, y: POS_MAX }).x)
  const leftSpace = panel.left - left
  const rightSpace = right - panel.right
  if (Math.max(leftSpace, rightSpace) < 80) return center
  const x = leftSpace >= rightSpace ? (left + panel.left) / 2 : (panel.right + right) / 2
  return cv.clientToPos(x, c.y).pos
}

function toggleCreateLanding(on: boolean) {
  const c = creating.value
  if (!c) return
  c.landing = on ? { ...roundPos(landingStartPos()), delay: null } : null
}

let landingGrab = { x: 0, y: 0 }
const landingDrag = usePointerDrag({
  start(e) {
    const l = creating.value?.landing
    if (!l || !canvas.value || mode.value !== 'normal') return false
    const p = canvas.value.clientToPos(e.clientX, e.clientY).pos
    // 保持按下的位置与圆心的相对距离，拖动时圆不会跳
    landingGrab = { x: l.x - p.x, y: l.y - p.y }
  },
  move(e) {
    const c = creating.value
    if (!c?.landing || !canvas.value) return
    const p = canvas.value.clientToPos(e.clientX, e.clientY).pos
    c.landing = { ...c.landing, ...roundPos({ x: p.x + landingGrab.x, y: p.y + landingGrab.y }) }
  },
})

function onBackgroundClick(e: { clientX: number; clientY: number }) {
  pop.close()
  // 点击新建中的路径：进入路径编辑并选中它
  const c = creating.value
  if (mode.value !== 'normal' || !c?.showPaths || !c.paths.length || !canvas.value) return
  const { pos } = canvas.value.clientToPos(e.clientX, e.clientY)
  const hit = pickPathAt(c.paths, pos, canvas.value.pxPerUnit())
  if (hit) enterPathMode(hit)
}

// ---------- 路径编辑（新建 Lineup 时） ----------
const editor = createPathEditor()
const drawing = usePathDrawing({
  editor,
  scale: () => canvas.value?.pxPerUnit(),
  anchors: () => (creating.value ? [creating.value.pos] : []),
})
const invalidPathIds = computed(() => (editor.tried ? editor.paths.filter((p) => !p.mode).map((p) => p.id) : []))
let sidebarBeforePaths = true

function enterPathMode(selectId: string | null = null) {
  const c = creating.value
  if (!c || mode.value !== 'normal') return
  pop.close()
  editor.start(c.paths, selectId)
  sidebarBeforePaths = prefs.sidebarOpen
  // 路径编辑面板放在导览栏的位置
  prefs.sidebarOpen = true
  mode.value = 'paths'
}

function leavePathMode() {
  drawing.onCancel()
  mode.value = 'normal'
  prefs.sidebarOpen = sidebarBeforePaths
}

async function finishPaths() {
  const c = creating.value
  if (!c) return leavePathMode()
  const error = editor.validate()
  if (error) {
    ui.toast(error, { kind: 'error' })
    return
  }
  if (!editor.paths.length) {
    const ok = await ui.confirm({
      title: '删除全部路径？',
      message: '这个 Lineup 将不再有路径追踪。',
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
  }
  c.paths = editor.result()
  c.showPaths = true
  leavePathMode()
}

async function exitPaths() {
  if (editor.dirty) {
    const choice = await ui.choose({
      title: '保存画好的路径？',
      message: '选择「不保存」会放弃这次对路径的修改。',
      confirmText: '保存路径',
      altText: '不保存',
      cancelText: '继续编辑',
    })
    if (choice === 'cancel') return
    if (choice === 'confirm') return finishPaths()
  }
  leavePathMode()
}

useLayer(() => mode.value === 'paths', exitPaths)

// ---------- 圈画搜索（在地图上圈出范围） ----------
const lasso = useStroke(() => canvas.value?.pxPerUnit())
let sidebarBeforeLasso = true

function toggleLasso() {
  if (mode.value === 'lasso') return cancelLasso()
  if (mode.value === 'rehearsal') endRehearsal(false)
  if (mode.value !== 'normal') return
  pop.close()
  mode.value = 'lasso'
  sidebarBeforeLasso = prefs.sidebarOpen
  // 小屏幕上导览栏会挡住地图
  if (drawerSidebar.value) prefs.sidebarOpen = false
}

function cancelLasso() {
  lasso.cancel()
  mode.value = 'normal'
  if (drawerSidebar.value) prefs.sidebarOpen = sidebarBeforeLasso
}

function finishLasso(pos: Position) {
  lasso.add(pos)
  const raw = lasso.finish()
  const s = canvas.value?.pxPerUnit()
  if (!raw || !s) return
  const polygon = simplifyPath(raw, 1.5, s).map(roundPos)
  if (polygon.length < 3 || polygonArea(polygon, s) < 600) {
    ui.toast('圈出的范围太小，请按住左键画一个闭合的圈', { kind: 'info' })
    return
  }
  area.value = polygon
  activeId.value = null
  mode.value = 'normal'
  // 在导览栏中显示搜索结果
  prefs.sidebarOpen = true
}

useLayer(() => mode.value === 'lasso', cancelLasso)

// 画笔事件分发给路径编辑或圈画搜索
type DrawPayload = { pos: Position; clientX: number; clientY: number }
function onDrawStart(p: DrawPayload) {
  if (mode.value === 'paths') drawing.onStart(p)
  else if (mode.value === 'lasso') lasso.begin(p.pos)
}
function onDrawMove(p: DrawPayload) {
  if (mode.value === 'paths') drawing.onMove(p)
  else if (mode.value === 'lasso') lasso.add(p.pos)
}
function onDrawEnd(p: DrawPayload) {
  if (mode.value === 'paths') drawing.onEnd(p)
  else if (mode.value === 'lasso') finishLasso(p.pos)
}
function onDrawCancel() {
  drawing.onCancel()
  lasso.cancel()
}
function onDrawTap(p: DrawPayload) {
  if (mode.value === 'paths') drawing.onTap(p)
}
function onDrawHover(p: DrawPayload | null) {
  if (mode.value === 'paths') drawing.onHover(p)
}

// ---------- 现场演练 ----------
const rehearsal = useRehearsal({ ultimate: () => prefs.rehearsalUltimate })
const rehearsalId = ref<string | null>(null)
const rehearsalLineup = computed(() => (rehearsalId.value ? store.lineupById.get(rehearsalId.value) : undefined))
/** 演练前的状态，结束演练时恢复 */
let beforeRehearsal: {
  view: ViewState
  pop: { key: string; focusId: string | null } | null
  sidebarOpen: boolean
} | null = null

const rehearsalLandingVisible = computed(() => {
  if (!rehearsal.landing) return false
  return !rehearsal.landingState || rehearsal.landingState.phase !== 'flight'
})

function startRehearsal(id: string) {
  const l = store.lineupById.get(id)
  if (!l?.paths.length || !canvas.value) return
  if (mode.value === 'lasso') cancelLasso()
  if (mode.value === 'paths') return
  if (mode.value !== 'rehearsal') {
    const ps = pop.state.value
    beforeRehearsal = {
      view: canvas.value.getViewState(),
      pop: ps?.pinned ? { key: ps.key, focusId: ps.focusId } : null,
      sidebarOpen: prefs.sidebarOpen,
    }
  }
  pop.close()
  hoverResultKey.value = null
  mode.value = 'rehearsal'
  rehearsalId.value = id
  if (drawerSidebar.value) prefs.sidebarOpen = false
  const points: Position[] = [l, ...l.paths.flatMap((p) => p.points), ...(l.landing ? [l.landing] : [])]
  const moved = canvas.value.fitBounds(boundsOf(points)!, 70)
  rehearsal.start({
    paths: l.paths,
    landing: l.landing,
    agentId: l.agentId,
    metric: metric.value,
    leadIn: moved ? 0.6 : 0.35,
  })
}

/** 结束演练；restore 为 true 时回到演练开始前的地图视图和预览窗口 */
function endRehearsal(restore = true) {
  if (mode.value !== 'rehearsal') return
  rehearsal.stop()
  rehearsalId.value = null
  mode.value = 'normal'
  const before = beforeRehearsal
  beforeRehearsal = null
  if (!before) return
  if (drawerSidebar.value) prefs.sidebarOpen = before.sidebarOpen
  if (restore && canvas.value) {
    canvas.value.restoreView(before.view)
    if (before.pop && groupByKey.value.has(before.pop.key)) pop.pin(before.pop.key, before.pop.focusId)
  }
}

useLayer(() => mode.value === 'rehearsal', () => endRehearsal())

// 切换地图 / 英雄时关闭浮层
watch(
  () => [prefs.mapId, prefs.agentId] as const,
  ([mapId], [oldMapId]) => {
    pop.close()
    endRehearsal(false)
    if (mode.value === 'lasso') cancelLasso()
    if (mode.value === 'paths') leavePathMode()
    creating.value = null
    activeId.value = null
    // 圈出的范围只对原来的地图有意义
    if (mapId !== oldMapId) area.value = null
  },
)

onDeactivated(() => {
  pop.close()
  endRehearsal(false)
  if (mode.value === 'lasso') cancelLasso()
  if (mode.value === 'paths') leavePathMode()
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
  if (e.key !== '/' || e.ctrlKey || e.metaKey || mode.value !== 'normal') return
  const t = e.target as HTMLElement
  if (t.closest('input, textarea, [contenteditable]')) return
  e.preventDefault()
  prefs.sidebarOpen = true
  requestAnimationFrame(() => sidebar.value?.focusSearch())
}
// 首页被 KeepAlive 缓存：只在显示时监听
onActivated(() => window.addEventListener('keydown', onKeydown))
onDeactivated(() => window.removeEventListener('keydown', onKeydown))

const mapPadding = computed(() =>
  narrow.value ? { top: 72, right: 12, bottom: 64, left: 12 } : { top: 76, right: 72, bottom: 40, left: 40 },
)
</script>

<template>
  <div class="home" :class="[`mode-${mode}`, { 'sidebar-open': prefs.sidebarOpen }]">
    <div class="sidebar-wrap">
      <HomeSidebar
        v-show="mode !== 'paths'"
        ref="sidebar"
        v-model:map-id="prefs.mapId"
        v-model:agent-id="prefs.agentId"
        v-model:query="query"
        v-model:type-ids="typeIds"
        v-model:time="time"
        v-model:area="area"
        v-model:area-by="prefs.areaSearchBy"
        v-model:hidden-ids="hiddenIds"
        :results="results"
        :total="scoped.length"
        :active-id="activeId"
        :map-counts="mapCounts"
        :agent-counts="agentCounts"
        :type-counts="typeCounts"
        :lasso-active="mode === 'lasso'"
        @focus="focusLineup"
        @detail="openDetail"
        @hover="(id) => (hoverResultKey = id ? posKey(store.lineupById.get(id)!) : null)"
        @rehearse="startRehearsal"
        @hide="hideLineup"
        @area-search="toggleLasso"
        @collapse="prefs.sidebarOpen = false"
        @settings="ui.openSettings()"
        @dictionary="router.push({ name: 'dict' })"
      />
      <PathEditorPanel
        v-if="mode === 'paths'"
        :editor="editor"
        :metric="metric"
        context="新建 Lineup"
        @finish="finishPaths"
        @exit="exitPaths"
      />
    </div>
    <div class="sidebar-backdrop" @click="prefs.sidebarOpen = false" />

    <main class="map-area">
      <MapCanvas
        ref="canvas"
        :src="map.image"
        :view-key="map.id"
        :padding="mapPadding"
        :tool="mode === 'lasso' || mode === 'paths' ? 'draw' : 'pan'"
        @map-dblclick="onMapDblClick"
        @background-click="onBackgroundClick"
        @view-change="viewTick++"
        @draw-start="onDrawStart"
        @draw-move="onDrawMove"
        @draw-end="onDrawEnd"
        @draw-cancel="onDrawCancel"
        @draw-tap="onDrawTap"
        @draw-hover="onDrawHover"
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

        <template #default="{ at, px, size }">
          <!-- 现场演练：只显示这个 Lineup 相关的图案 -->
          <template v-if="mode === 'rehearsal' && rehearsalLineup">
            <LandingMarker
              v-if="rehearsal.landing && rehearsalLandingVisible"
              :style="at(rehearsal.landing)"
              :diameter="landingDiameter(rehearsalLineup.agentId, size.w)"
              :color="
                rehearsal.landingState?.phase === 'ult'
                  ? rehearsal.ultimateSpec?.color
                  : landingColor(rehearsalLineup.agentId)
              "
              :beam="rehearsal.landingState?.phase === 'ult'"
              :dim="rehearsal.landingState?.phase === 'done'"
            />
            <PathLayer :paths="rehearsalLineup.paths" :px="px" :size="size" />
            <MapMarker
              variant="single"
              :style="at(rehearsalLineup)"
              :color="store.typeColor(rehearsalLineup.typeId)"
              :size="markerPx"
              :label="rehearsalLineup.name"
            />
            <LandingCountdown
              v-if="rehearsal.landing && rehearsal.landingState && rehearsal.spec"
              :style="at(rehearsal.landing)"
              :phase="rehearsal.landingState.phase"
              :remaining="rehearsal.landingState.remaining"
              :label="rehearsal.spec.label"
              :ult-label="rehearsal.ultimateSpec?.label"
              :offset="(landingDiameter(rehearsalLineup.agentId, size.w) ?? 0) / 2"
            />
            <RehearsalDot v-if="rehearsal.dot" :style="at(rehearsal.dot)" :moving="rehearsal.moving" />
          </template>

          <template v-else>
            <!-- 圈画搜索的范围 -->
            <AreaLayer v-if="mode === 'lasso' && lasso.points.value" :points="lasso.points.value" :px="px" :size="size" />
            <AreaLayer v-else-if="area" :points="area" :px="px" :size="size" closed />

            <!-- 按落点圈画搜索时，结果的落点 -->
            <LandingMarker
              v-for="l in areaLandings"
              :key="`area-${l.id}`"
              :style="at(l.landing!)"
              :diameter="landingDiameter(l.agentId, size.w)"
              :color="landingColor(l.agentId)"
              :label="`${l.name} 的落点`"
            />
            <!-- 选中的 Lineup：收起预览卡片后也继续显示它的落点和路径 -->
            <template v-if="selectedLineup">
              <LandingMarker
                v-if="selectedLineup.landing"
                :style="at(selectedLineup.landing)"
                :diameter="landingDiameter(selectedLineup.agentId, size.w)"
                :color="landingColor(selectedLineup.agentId)"
                :label="`${selectedLineup.name} 的落点`"
              />
              <PathLayer v-if="selectedLineup.paths.length" :paths="selectedLineup.paths" show-numbers :px="px" :size="size" />
            </template>
            <!-- 预览窗口中的 Lineup：显示它的落点和路径 -->
            <template v-if="previewLineup">
              <LandingMarker
                v-if="previewLineup.landing"
                :style="at(previewLineup.landing)"
                :diameter="landingDiameter(previewLineup.agentId, size.w)"
                :color="landingColor(previewLineup.agentId)"
              />
              <PathLayer v-if="previewLineup.paths.length" :paths="previewLineup.paths" variant="preview" :px="px" :size="size" />
            </template>

            <!-- 新建中的落点和路径 -->
            <template v-if="creating">
              <LandingMarker
                v-if="creating.landing"
                :style="at(creating.landing)"
                :diameter="landingDiameter(prefs.agentId, size.w)"
                :color="landingColor(prefs.agentId)"
                :draggable="mode === 'normal'"
                :dragging="landingDrag.dragging.value"
                @pointerdown="landingDrag.onDown"
              />
              <PathLayer
                v-if="mode === 'paths'"
                variant="edit"
                show-numbers
                :paths="editor.paths"
                :selected-id="editor.selectedId"
                :stroke="drawing.stroke.value"
                :invalid-ids="invalidPathIds"
                :px="px"
                :size="size"
              />
              <PathLayer v-else-if="creating.showPaths && creating.paths.length" :paths="creating.paths" show-numbers :px="px" :size="size" />
            </template>

            <div class="markers" :class="{ dim: mode !== 'normal' }">
              <MapMarker
                v-for="g in groups"
                :key="g.key"
                :style="at(g)"
                :variant="markerVariant(g)"
                :color="store.typeColor(g.items[0]!.typeId)"
                :count="g.items.length"
                :size="markerPx"
                :highlight="highlightKey === g.key"
                :selected="pop.state.value?.key === g.key || hoverResultKey === g.key || selectedKey === g.key"
                :ring="selectedKey === g.key"
                :label="g.items.length > 1 ? `此位置有 ${g.items.length} 个 Lineup` : g.items[0]!.name"
                @pointerenter="onMarkerEnter($event, g.key)"
                @pointerleave="onMarkerLeave"
                @click="onMarkerClick(g.key)"
                @dblclick.stop="createAt(g)"
              />
            </div>
            <MapMarker v-if="creating" variant="pending" :style="at(creating.pos)" color="#ff4655" :size="markerPx" />
            <span v-if="mode === 'paths' && drawing.snapHint.value" class="snap-ring" :style="at(drawing.snapHint.value)" />
          </template>
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
              <p v-if="mode === 'rehearsal' && rehearsalLineup" class="subtitle rehearsal-sub">
                <Icon name="play" :size="12" />
                现场演练
                <span class="dot-sep" />
                <span class="ellipsis rehearsal-name">{{ rehearsalLineup.name }}</span>
              </p>
              <p v-else class="subtitle">
                <AgentAvatar :agent-id="prefs.agentId" :size="18" />
                {{ agent?.name }}
                <span class="dot-sep" />
                <template v-if="filters.active">显示 {{ results.length }} / {{ scoped.length }} 个 Lineup</template>
                <template v-else>{{ scoped.length }} 个 Lineup</template>
                <button v-if="filters.active" type="button" class="link" @click="filters.clear()">清除筛选</button>
              </p>
              <RehearsalTimers
                v-if="mode === 'rehearsal'"
                v-model:spike-start="prefs.spikeSeconds"
                v-model:ultimate="prefs.rehearsalUltimate"
                class="timers"
                :elapsed="rehearsal.travel"
                :ult-label="rehearsal.ultimateSpec?.label"
                :ult-seconds="rehearsal.ultimateSpec?.duration"
                :ult-after="rehearsal.spec?.label"
              />
            </div>
          </div>

          <div v-if="mode === 'rehearsal'" class="hud hud-bottom" data-map-ui>
            <RehearsalControls :finished="rehearsal.finished" @restart="rehearsal.restart()" @exit="endRehearsal()" />
          </div>
          <div v-else-if="mode === 'lasso'" class="hud hud-hint mode-hint" data-map-ui>
            <Icon name="pen" :size="15" />
            <span>
              按住<b>左键</b>在地图上圈出范围，松开后搜索范围内的{{ prefs.areaSearchBy === 'landing' ? '落点' : '站位' }}
              · <b>右键</b>拖动平移 · Esc 取消
            </span>
            <button type="button" class="btn btn-sm btn-ghost" @click="cancelLasso">取消</button>
          </div>
          <div v-else-if="mode === 'paths'" class="hud hud-hint mode-hint path-hint" data-map-ui>
            <Icon name="route" :size="15" />
            <span>路径编辑：按住<b>左键</b>画线，松开完成一条路径 · 点击路径选中 · <b>右键</b>拖动平移</span>
          </div>
          <div v-else-if="selectedLineup" class="hud hud-selection" data-map-ui>
            <i class="sel-dot" :style="{ background: store.typeColor(selectedLineup.typeId) }" />
            <span class="sel-label">已选中</span>
            <button type="button" class="sel-name ellipsis" title="显示预览卡片" @click="reopenSelected">
              {{ selectedLineup.name }}
            </button>
            <button type="button" class="btn btn-sm btn-outline" @click="clearSelection">
              <Icon name="x" :size="14" />
              取消选中
            </button>
          </div>
          <div v-else-if="!prefs.hintDismissed" class="hud hud-hint" data-map-ui>
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
      v-if="popGroup && popAnchor && !creating && mode === 'normal'"
      :lineups="popGroup.items"
      :anchor="popAnchor"
      :radius="markerPx / 2 + 4"
      :focus-id="pop.state.value?.focusId"
      show-rehearse
      @enter="pop.popoverEnter()"
      @leave="pop.popoverLeave()"
      @detail="openDetail"
      @rehearse="startRehearsal"
      @current="onPopoverCurrent"
      @create-same="createAt(popGroup)"
    />

    <CreateLineupPanel
      v-if="creating"
      ref="createPanel"
      :anchor="creating.anchor"
      :pos="creating.pos"
      :map-id="prefs.mapId"
      :agent-id="prefs.agentId"
      :stack-count="creating.stackCount"
      :landing="creating.landing"
      :paths="creating.paths"
      :show-paths="creating.showPaths"
      :metric="metric"
      :hidden="mode === 'paths' || mode === 'rehearsal'"
      @toggle-landing="toggleCreateLanding"
      @update:landing="(v) => creating && (creating.landing = v)"
      @update:show-paths="(v) => creating && (creating.showPaths = v)"
      @edit-paths="enterPathMode()"
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
.hud-bottom {
  left: 16px;
  bottom: 14px;
}
/* 选中 Lineup 时左下角的「取消选中」 */
.hud-selection {
  left: 16px;
  bottom: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 90px);
  padding: 5px 5px 5px 12px;
  border: 1px solid rgb(120 251 231 / 0.4);
  border-radius: var(--r);
  background: rgb(13 20 25 / 0.9);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-card);
  font-size: 12px;
}
.sel-dot {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px #fff;
}
.sel-label {
  flex: none;
  color: var(--text-3);
}
.sel-name {
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  text-align: left;
}
.sel-name:hover {
  color: var(--cyan);
}
.mode-hint {
  border-color: rgb(120 251 231 / 0.35);
  color: var(--text);
}
.mode-hint :deep(.icon) {
  color: var(--cyan);
}
.path-hint {
  border-color: rgb(61 139 255 / 0.5);
}
.path-hint :deep(.icon),
.path-hint b {
  color: #7cb2ff;
}
.rehearsal-sub {
  color: var(--cyan);
  font-weight: 600;
}
.rehearsal-name {
  max-width: 320px;
  color: var(--text);
}
.timers {
  margin-top: 10px;
}
.markers {
  transition: opacity 0.2s var(--ease);
}
.markers.dim {
  opacity: 0.35;
}
/* 画路径时的吸附提示 */
.snap-ring {
  position: absolute;
  z-index: 5;
  width: 24px;
  height: 24px;
  border: 2px solid #7cb2ff;
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgb(61 139 255 / 0.25);
  transform: translate(-50%, -50%);
  pointer-events: none;
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
