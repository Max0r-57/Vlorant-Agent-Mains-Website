<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { landingSpec } from '@/data/landing'
import { MAPS, MAP_BY_ID, mapWidthMeters } from '@/data/maps'
import { useLayer } from '@/composables/useLayer'
import { useMarkerPopover } from '@/composables/useMarkerPopover'
import { createPathEditor } from '@/composables/usePathEditor'
import { pickPathAt, usePathDrawing } from '@/composables/usePathDrawing'
import { usePointerDrag } from '@/composables/usePointerDrag'
import { useRehearsal } from '@/composables/useRehearsal'
import { boundsOf, mapMetric, roundPos } from '@/lib/geometry'
import { findNearestGroup, groupByPosition, posKey, type MarkerGroup } from '@/lib/positions'
import { buildRoute, formatDuration } from '@/lib/rehearsal'
import { useLineups } from '@/stores/lineups'
import { MARKER_PX, usePrefs } from '@/stores/prefs'
import { useUi } from '@/stores/ui'
import { POS_MAX, type Landing, type Lineup, type LineupPath, type Position } from '@/types'
import Icon from '@/components/common/Icon.vue'
import MapPicker from '@/components/common/MapPicker.vue'
import LandingCountdown from '@/components/map/LandingCountdown.vue'
import LandingMarker from '@/components/map/LandingMarker.vue'
import MapCanvas, { type ViewState } from '@/components/map/MapCanvas.vue'
import MapMarker from '@/components/map/MapMarker.vue'
import MarkerPopover from '@/components/map/MarkerPopover.vue'
import PathLayer from '@/components/map/PathLayer.vue'
import RehearsalControls from '@/components/map/RehearsalControls.vue'
import RehearsalDot from '@/components/map/RehearsalDot.vue'
import RehearsalTimers from '@/components/map/RehearsalTimers.vue'
import DelayInput from './DelayInput.vue'
import PathEditorPanel from './PathEditorPanel.vue'

/**
 * 详情页的位置编辑（位置、落点参照、路径追踪、现场演练都在这张地图上）：
 * - 地图上显示同一英雄在该地图的全部 Lineup，当前 Lineup 为黄色；
 * - 拖动黄色圆点修改位置；拖到其他圆点附近松开会吸附并合并到同一位置；
 * - 当前 Lineup 位于多个 Lineup 的位置（黑点）时，从黑点上按住拖动即可把它单独拖出来；
 * - 也可以双击地图任意处直接移动过去；
 * - 落点：打开「落点参照」后拖动地图上的落点图案，右侧填写落点时间；
 * - 路径：点击地图上的路径或「新增路径」进入路径编辑（编辑面板停靠在地图左侧）；
 * - 有路径时可以「现场演练」。
 * 修改都只是暂存在表单里，点详情页右上角「保存」后才写入。
 */
const props = defineProps<{
  lineup: Lineup
  agentId: string
  /** 表单里当前的名字（路径编辑面板顶部显示） */
  lineupName?: string
}>()
const emit = defineEmits<{ detail: [id: string] }>()

const mapId = defineModel<string>('mapId', { required: true })
const pos = defineModel<Position>('pos', { required: true })
const landing = defineModel<Landing | null>('landing', { required: true })
const paths = defineModel<LineupPath[]>('paths', { required: true })

const store = useLineups()
const ui = useUi()
const { prefs } = usePrefs()
const canvas = ref<InstanceType<typeof MapCanvas>>()
const frame = ref<HTMLElement>()
const markerPx = computed(() => MARKER_PX[prefs.markerSize])
const snapPx = computed(() => Math.max(14, markerPx.value + 2))

const map = computed(() => MAP_BY_ID.get(mapId.value) ?? MAPS[0]!)
const widthMeters = computed(() => mapWidthMeters(map.value.id))
const metric = computed(() => mapMetric(widthMeters.value, canvas.value?.aspect ?? 1))
const spec = computed(() => landingSpec(props.agentId))
const routeTime = computed(() => buildRoute(paths.value, metric.value).duration)

/** normal：调整位置 / 落点；paths：编辑路径；rehearsal：现场演练 */
const mode = ref<'normal' | 'paths' | 'rehearsal'>('normal')
const showPaths = ref(true)

function landingDiameter(mapW: number) {
  return spec.value ? (spec.value.diameter / widthMeters.value) * mapW : null
}

/** 同一地图、同一英雄的其他 Lineup */
const others = computed(() =>
  store.lineups.filter(
    (l) => l.id !== props.lineup.id && l.mapId === mapId.value && l.agentId === props.agentId,
  ),
)
const groups = computed(() => groupByPosition(others.value))
const mapCounts = computed(() => {
  const m = new Map<string, number>()
  for (const l of store.lineups) if (l.agentId === props.agentId) m.set(l.mapId, (m.get(l.mapId) ?? 0) + 1)
  return m
})

/** 落点和路径是画在这张地图上的：切换地图时一起清除（「撤销修改」可以恢复） */
async function changeMap(id: string) {
  if (id === mapId.value || mode.value !== 'normal') return
  if (landing.value || paths.value.length) {
    const ok = await ui.confirm({
      title: '切换地图？',
      message: '落点和路径是画在当前地图上的，切换后会被清除。\n需要恢复时，点右上角「撤销修改」。',
      confirmText: '切换并清除',
    })
    if (!ok) return
    landing.value = null
    paths.value = []
  }
  mapId.value = id
}

// ---------- 拖动 ----------
const dragging = ref(false)
const dragPos = ref<Position | null>(null)
const snapKey = ref<string | null>(null)
let drag: { x: number; y: number; moved: boolean; fromStack: MarkerGroup<Lineup> | null } | null = null

const activeKey = computed(() => posKey(pos.value))
/** 当前 Lineup 所在的「多 Lineup 位置」（不拖动时） */
const activeGroup = computed(() =>
  dragging.value ? undefined : groups.value.find((g) => g.key === activeKey.value),
)
const snapGroup = computed(() => (snapKey.value ? groups.value.find((g) => g.key === snapKey.value) : undefined))
const displayPos = computed<Position>(() => {
  if (dragging.value) return snapGroup.value ?? dragPos.value ?? pos.value
  return pos.value
})
const stackCount = computed(() => (activeGroup.value ? activeGroup.value.items.length : 0))

function startDrag(e: PointerEvent, fromStack: MarkerGroup<Lineup> | null = null) {
  if (e.button !== 0 || mode.value !== 'normal') return
  e.preventDefault()
  e.stopPropagation()
  pop.close()
  drag = { x: e.clientX, y: e.clientY, moved: false, fromStack }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

function onDragMove(e: PointerEvent) {
  if (!drag || !canvas.value) return
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return
  drag.moved = true
  dragging.value = true
  const { pos: p } = canvas.value.clientToPos(e.clientX, e.clientY)
  dragPos.value = p
  snapKey.value = findNearestGroup(groups.value, p, snapPx.value, canvas.value.pxPerUnit())?.key ?? null
}

function onDragEnd(e: PointerEvent) {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
  const d = drag
  drag = null
  if (!d) return
  if (d.moved && e.type !== 'pointercancel') {
    const target = snapGroup.value ?? dragPos.value
    if (target) pos.value = { x: target.x, y: target.y }
  } else if (!d.moved && d.fromStack) {
    // 单击黑点（未拖动）：查看这个位置的所有 Lineup
    pop.pin(d.fromStack.key, props.lineup.id)
  }
  dragging.value = false
  dragPos.value = null
  snapKey.value = null
}

// 详情页可以上下滚动，滚动时预览窗口的位置会失效，直接关闭
function onPageScroll(e: Event) {
  // 预览窗口内部的卡片横向滑动也会触发 scroll 事件，需要排除
  if (e.target instanceof Element && e.target.closest('.popover')) return
  if (pop.state.value) pop.close()
}
onMounted(() => window.addEventListener('scroll', onPageScroll, true))

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
  window.removeEventListener('scroll', onPageScroll, true)
})

/** 双击地图：把当前 Lineup 移动到该处（靠近其他圆点时同样吸附合并） */
function onMapDblClick(payload: { pos: Position }) {
  if (!canvas.value || mode.value !== 'normal') return
  const near = findNearestGroup(groups.value, payload.pos, snapPx.value, canvas.value.pxPerUnit())
  pos.value = near ? { x: near.x, y: near.y } : payload.pos
}

/** 从当前位置移出：在附近找一个空位 */
function detach() {
  if (!activeGroup.value || !canvas.value) return
  const ppu = canvas.value.pxPerUnit()
  const step = Math.round((markerPx.value * 2.2) / ppu.x)
  const candidates = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2
    return {
      x: Math.min(10000, Math.max(0, Math.round(pos.value.x + Math.cos(a) * step))),
      y: Math.min(10000, Math.max(0, Math.round(pos.value.y + Math.sin(a) * step))),
    }
  })
  const free = candidates.find((c) => !findNearestGroup(groups.value, c, snapPx.value, ppu)) ?? candidates[1]!
  pos.value = free
}

// ---------- 落点参照 ----------
function toggleLanding() {
  if (mode.value !== 'normal') return
  landing.value = landing.value
    ? null
    : { ...roundPos(canvas.value?.centerPos() ?? { x: POS_MAX / 2, y: POS_MAX / 2 }), delay: null }
}

function setDelay(delay: number | null) {
  if (landing.value) landing.value = { ...landing.value, delay }
}

let landingGrab = { x: 0, y: 0 }
const landingDrag = usePointerDrag({
  start(e) {
    const l = landing.value
    if (!l || !canvas.value || mode.value !== 'normal') return false
    pop.close()
    const p = canvas.value.clientToPos(e.clientX, e.clientY).pos
    landingGrab = { x: l.x - p.x, y: l.y - p.y }
  },
  move(e) {
    if (!landing.value || !canvas.value) return
    const p = canvas.value.clientToPos(e.clientX, e.clientY).pos
    landing.value = { ...landing.value, ...roundPos({ x: p.x + landingGrab.x, y: p.y + landingGrab.y }) }
  },
})

// ---------- 路径编辑 ----------
const editor = createPathEditor()
const drawing = usePathDrawing({
  editor,
  scale: () => canvas.value?.pxPerUnit(),
  anchors: () => [pos.value],
})
const invalidPathIds = computed(() => (editor.tried ? editor.paths.filter((p) => !p.mode).map((p) => p.id) : []))

/** 详情页可以滚动：画路径 / 演练时把地图滚动到可见位置 */
function revealMap() {
  frame.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

function enterPathMode(selectId: string | null = null) {
  if (mode.value !== 'normal') return
  pop.close()
  editor.start(paths.value, selectId)
  mode.value = 'paths'
  revealMap()
}

function leavePathMode() {
  drawing.onCancel()
  mode.value = 'normal'
}

async function finishPaths() {
  const error = editor.validate()
  if (error) {
    ui.toast(error, { kind: 'error' })
    return
  }
  if (!editor.paths.length) {
    const ok = await ui.confirm({
      title: '删除全部路径？',
      message: '这个 Lineup 将不再有路径追踪（保存后生效）。',
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
  }
  const changed = editor.dirty
  paths.value = editor.result()
  showPaths.value = true
  leavePathMode()
  if (changed) ui.toast('路径已更新，点右上角「保存」后生效', { kind: 'info' })
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

/** 单击地图空白处：关闭预览窗口；点在路径上时进入路径编辑并选中它 */
function onBackgroundClick(e: { clientX: number; clientY: number }) {
  pop.close()
  if (mode.value !== 'normal' || !showPaths.value || !paths.value.length || !canvas.value) return
  const { pos: p } = canvas.value.clientToPos(e.clientX, e.clientY)
  const hit = pickPathAt(paths.value, p, canvas.value.pxPerUnit())
  if (hit) enterPathMode(hit)
}

type DrawPayload = { pos: Position; clientX: number; clientY: number }
function onDrawTap(p: DrawPayload) {
  drawing.onTap(p)
}

// ---------- 现场演练 ----------
const rehearsal = useRehearsal()
let viewBeforeRehearsal: ViewState | null = null
const rehearsalLandingVisible = computed(() => {
  if (!rehearsal.landing) return false
  return !rehearsal.landingState || rehearsal.landingState.phase !== 'flight'
})

function startRehearsal() {
  if (!paths.value.length || !canvas.value) return
  if (mode.value === 'paths') return
  if (mode.value !== 'rehearsal') viewBeforeRehearsal = canvas.value.getViewState()
  pop.close()
  mode.value = 'rehearsal'
  revealMap()
  const points: Position[] = [pos.value, ...paths.value.flatMap((p) => p.points), ...(landing.value ? [landing.value] : [])]
  const moved = canvas.value.fitBounds(boundsOf(points)!, 50)
  rehearsal.start({
    paths: paths.value,
    landing: landing.value,
    agentId: props.agentId,
    metric: metric.value,
    leadIn: moved ? 0.6 : 0.35,
  })
}

/** 结束演练，回到演练开始前的地图视图 */
function endRehearsal(restore = true) {
  if (mode.value !== 'rehearsal') return
  rehearsal.stop()
  mode.value = 'normal'
  if (restore && viewBeforeRehearsal) canvas.value?.restoreView(viewBeforeRehearsal)
  viewBeforeRehearsal = null
}

useLayer(() => mode.value === 'rehearsal', () => endRehearsal())

// ---------- 预览窗口（其他 Lineup） ----------
const pop = useMarkerPopover()
const viewTick = ref(0)
useLayer(() => !!pop.state.value, pop.close)

const popGroup = computed(() => (pop.state.value ? groups.value.find((g) => g.key === pop.state.value!.key) : undefined))
const popLineups = computed(() => {
  const g = popGroup.value
  if (!g) return []
  // 当前 Lineup 所在的位置：把它也放进列表并标为「当前」
  return g.key === activeKey.value && !dragging.value ? [props.lineup, ...g.items] : g.items
})
const popAnchor = computed(() => {
  void viewTick.value
  const g = popGroup.value
  if (!g || !canvas.value || !canvas.value.isPosVisible(g, 4)) return null
  return canvas.value.posToClient(g)
})

function onMarkerEnter(e: PointerEvent, key: string) {
  if (e.pointerType === 'mouse' && !dragging.value && key !== activeKey.value && mode.value === 'normal') {
    pop.hoverEnter(key)
  }
}
function onMarkerLeave(e: PointerEvent) {
  if (e.pointerType === 'mouse') pop.hoverLeave()
}

/** 退出路径编辑和演练（不保存），例如撤销修改或切换到另一个 Lineup 时 */
function reset() {
  endRehearsal(false)
  if (mode.value === 'paths') leavePathMode()
  pop.close()
}

defineExpose({
  reset,
  /** 路径编辑面板里还有没完成的修改 */
  hasPendingPathEdits: () => mode.value === 'paths' && editor.dirty,
  isEditingPaths: () => mode.value === 'paths',
})

const mapPadding = { top: 20, right: 64, bottom: 20, left: 20 }
</script>

<template>
  <section class="position-editor">
    <div class="toolbar">
      <div class="field map-field tool" :class="{ disabled: mode !== 'normal' }">
        <span class="field-label">所在地图</span>
        <MapPicker
          :model-value="mapId"
          :counts="mapCounts"
          @update:model-value="(v) => v && changeMap(v)"
        />
      </div>

      <div class="field tool" :class="{ disabled: mode !== 'normal' }">
        <span class="field-label">
          <Icon name="target" :size="13" />
          落点参照
        </span>
        <div class="tool-row">
          <button
            type="button"
            class="switch"
            role="switch"
            :aria-checked="!!landing"
            aria-label="落点参照"
            :disabled="mode !== 'normal'"
            @click="toggleLanding"
          />
          <span v-if="landing" class="delay-field" title="落点时间：从出发到落地，现场演练时先倒数">
            <span class="delay-label">落点时间</span>
            <DelayInput :model-value="landing.delay" @update:model-value="setDelay" />
          </span>
        </div>
      </div>

      <div class="field tool" :class="{ disabled: mode !== 'normal' }">
        <span class="field-label">
          <Icon name="route" :size="13" />
          路径追踪
          <span v-if="paths.length" class="tool-meta tabular">{{ paths.length }} 条 · 约 {{ formatDuration(routeTime) }}</span>
        </span>
        <div class="tool-row">
          <template v-if="paths.length">
            <label class="inline-switch">
              <button
                type="button"
                class="switch"
                role="switch"
                :aria-checked="showPaths"
                aria-label="显示路径"
                :disabled="mode !== 'normal'"
                @click="showPaths = !showPaths"
              />
              显示路径
            </label>
            <button type="button" class="btn btn-outline" :disabled="mode !== 'normal'" @click="enterPathMode()">
              <Icon name="plus" :size="15" />
              新增路径
            </button>
          </template>
          <button v-else type="button" class="btn btn-outline" :disabled="mode !== 'normal'" @click="enterPathMode()">
            <Icon name="plus" :size="15" />
            增加路径追踪
          </button>
        </div>
      </div>

      <button
        v-if="paths.length"
        type="button"
        class="btn rehearse-btn"
        :class="{ on: mode === 'rehearsal' }"
        :disabled="mode === 'paths'"
        @click="startRehearsal"
      >
        <Icon name="play" :size="14" />
        现场演练
      </button>
    </div>

    <p class="help">
      <Icon name="hand" :size="15" />
      <span v-if="mode === 'paths'">
        在地图上按住<b>左键</b>画线，松开完成一条路径；起点靠近<b class="gold">黄色圆点</b>或路径终点会自动吸附。
        点击路径可修改它的信息，<b>右键 / 空格 + 拖动</b>平移地图，按住 <span class="kbd">Ctrl</span> 滚动缩放。
      </span>
      <span v-else>
        拖动<b class="gold">黄色圆点</b>调整位置；拖到其他圆点附近松开可<b>合并到同一位置</b>；
        从黑点上按住拖动可把当前 Lineup 单独拖出。也可以<b>双击</b>地图直接移动。
        <template v-if="landing">拖动<b class="molly">{{ spec ? '红色圆形' : '落点标记' }}</b>调整落点。</template>
        <template v-if="paths.length && showPaths">点击<b class="path">蓝色路径</b>可编辑路径。</template>
      </span>
    </p>

    <div ref="frame" class="map-frame" :class="{ editing: mode === 'paths' }">
      <PathEditorPanel
        v-if="mode === 'paths'"
        class="dock"
        variant="dock"
        :editor="editor"
        :metric="metric"
        :context="lineupName || lineup.name"
        @finish="finishPaths"
        @exit="exitPaths"
      />
      <div class="map-main">
        <MapCanvas
          ref="canvas"
          :src="map.image"
          :view-key="map.id"
          :padding="mapPadding"
          wheel-zoom="ctrl"
          :tool="mode === 'paths' ? 'draw' : 'pan'"
          @map-dblclick="onMapDblClick"
          @background-click="onBackgroundClick"
          @view-change="viewTick++"
          @draw-start="drawing.onStart"
          @draw-move="drawing.onMove"
          @draw-end="drawing.onEnd"
          @draw-cancel="drawing.onCancel"
          @draw-tap="onDrawTap"
          @draw-hover="drawing.onHover"
        >
          <template #default="{ at, px, size }">
            <!-- 现场演练：只显示当前 Lineup 相关的图案 -->
            <template v-if="mode === 'rehearsal'">
              <LandingMarker
                v-if="rehearsal.landing && rehearsalLandingVisible"
                :style="at(rehearsal.landing)"
                :diameter="landingDiameter(size.w)"
                :color="spec?.color"
                :dim="rehearsal.landingState?.phase === 'done'"
              />
              <PathLayer :paths="paths" :px="px" :size="size" />
              <MapMarker variant="active" :style="at(pos)" :size="markerPx + 2" :label="lineup.name" />
              <LandingCountdown
                v-if="rehearsal.landing && rehearsal.landingState && rehearsal.spec"
                :style="at(rehearsal.landing)"
                :phase="rehearsal.landingState.phase"
                :remaining="rehearsal.landingState.remaining"
                :label="rehearsal.spec.label"
                :offset="(landingDiameter(size.w) ?? 0) / 2"
              />
              <RehearsalDot v-if="rehearsal.dot" :style="at(rehearsal.dot)" :moving="rehearsal.moving" />
            </template>

            <template v-else>
              <LandingMarker
                v-if="landing"
                :style="at(landing)"
                :diameter="landingDiameter(size.w)"
                :color="spec?.color"
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
              <PathLayer v-else-if="showPaths && paths.length" :paths="paths" show-numbers :px="px" :size="size" />

              <div class="markers" :class="{ dim: mode === 'paths' }">
                <template v-for="g in groups" :key="g.key">
                  <MapMarker
                    v-if="activeGroup && g.key === activeGroup.key"
                    variant="active-stack"
                    :style="at(g)"
                    :count="g.items.length + 1"
                    :size="markerPx"
                    :selected="pop.state.value?.key === g.key"
                    :label="`当前 Lineup 与另外 ${g.items.length} 个位于同一位置，按住拖动可移出`"
                    title="按住拖动可把当前 Lineup 移出；单击查看此位置的全部 Lineup"
                    @pointerdown="startDrag($event, g)"
                  />
                  <MapMarker
                    v-else
                    :variant="g.items.length > 1 ? 'stack' : 'single'"
                    :style="at(g)"
                    :color="store.typeColor(g.items[0]!.typeId)"
                    :count="g.items.length"
                    :size="markerPx"
                    :snap-target="snapKey === g.key"
                    :selected="pop.state.value?.key === g.key"
                    :label="g.items.length > 1 ? `此位置有 ${g.items.length} 个 Lineup` : g.items[0]!.name"
                    @pointerenter="onMarkerEnter($event, g.key)"
                    @pointerleave="onMarkerLeave"
                    @click="mode === 'normal' && pop.toggle(g.key)"
                  />
                </template>
              </div>
              <MapMarker
                v-if="!activeGroup"
                variant="active"
                :style="at(displayPos)"
                :size="markerPx + 2"
                :dragging="dragging"
                :label="`${lineup.name}（当前 Lineup），按住拖动调整位置`"
                title="按住拖动调整位置"
                @pointerdown="startDrag($event)"
              />
              <span v-if="mode === 'paths' && drawing.snapHint.value" class="snap-ring" :style="at(drawing.snapHint.value)" />
            </template>
          </template>

          <template #overlay>
            <div class="hud-zoom" data-map-ui>
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

            <template v-if="mode === 'rehearsal'">
              <RehearsalTimers class="rehearsal-timers" :elapsed="rehearsal.travel" />
              <RehearsalControls
                class="rehearsal-controls"
                :finished="rehearsal.finished"
                @restart="rehearsal.restart()"
                @exit="endRehearsal()"
              />
            </template>
            <div v-else-if="mode === 'paths'" class="status path-status" data-map-ui>
              <Icon name="route" :size="15" />
              路径编辑中 · 共 {{ editor.paths.length }} 条
            </div>
            <div v-else class="status" data-map-ui>
              <template v-if="dragging && snapGroup">
                <Icon name="layers" :size="15" />
                松开合并到此位置（共 {{ snapGroup.items.length + 1 }} 个 Lineup）
              </template>
              <template v-else-if="dragging">
                <Icon name="move" :size="15" />
                松开放置
              </template>
              <template v-else-if="stackCount">
                <Icon name="layers" :size="15" />
                与另外 {{ stackCount }} 个 Lineup 位于同一位置
                <button type="button" class="btn btn-sm btn-outline" @click="detach">移出到附近</button>
              </template>
              <template v-else>
                <i class="gold-dot" />
                当前位置
                <span class="coords tabular">({{ (pos.x / 100).toFixed(1) }}%, {{ (pos.y / 100).toFixed(1) }}%)</span>
              </template>
            </div>
          </template>
        </MapCanvas>
      </div>
    </div>

    <MarkerPopover
      v-if="popGroup && popAnchor && !dragging && mode === 'normal'"
      :lineups="popLineups"
      :anchor="popAnchor"
      :radius="markerPx / 2 + 4"
      :focus-id="pop.state.value?.focusId"
      :current-id="lineup.id"
      :show-create="false"
      @enter="pop.popoverEnter()"
      @leave="pop.popoverLeave()"
      @detail="(id) => emit('detail', id)"
    />
  </section>
</template>

<style scoped>
.position-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 20px;
}
.map-field {
  flex: none;
}
.tool {
  flex: none;
}
.tool.disabled {
  opacity: 0.55;
}
.map-field.disabled {
  pointer-events: none;
}
.tool .field-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.tool-meta {
  color: #7cb2ff;
  font-weight: 600;
}
.tool-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
}
.delay-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.delay-field :deep(.delay-input) {
  width: 104px;
}
.delay-label {
  color: var(--text-2);
  font-size: 12px;
  white-space: nowrap;
}
.inline-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.rehearse-btn {
  --btn-border: rgb(120 251 231 / 0.45);
  --btn-bg: var(--cyan-soft);
  --btn-bg-hover: rgb(120 251 231 / 0.18);
  --btn-fg: var(--cyan);
  height: 36px;
  margin-left: auto;
}
.rehearse-btn.on {
  --btn-bg: rgb(120 251 231 / 0.2);
}
.help {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--surface);
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.6;
}
.help :deep(.icon) {
  flex: none;
  margin-top: 2px;
  color: var(--text-3);
}
.help b {
  color: var(--text);
}
.help b.gold {
  color: var(--gold);
}
.help b.molly {
  color: #ff8a70;
}
.help b.path {
  color: #7cb2ff;
}
.map-frame {
  position: relative;
  display: flex;
  height: min(760px, 78vh);
  min-height: 420px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
}
.map-frame.editing {
  border-color: rgb(61 139 255 / 0.55);
}
.dock {
  flex: none;
}
.map-main {
  position: relative;
  flex: 1;
  min-width: 0;
}
.markers {
  transition: opacity 0.2s var(--ease);
}
.markers.dim {
  opacity: 0.35;
}
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
.hud-zoom {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hud-btn {
  --btn-bg: rgb(18 27 34 / 0.85);
  backdrop-filter: blur(6px);
}
.rehearsal-timers {
  position: absolute;
  left: 12px;
  top: 12px;
  pointer-events: none;
}
.rehearsal-controls {
  position: absolute;
  left: 12px;
  bottom: 12px;
}
.status {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 80px);
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: rgb(13 20 25 / 0.88);
  backdrop-filter: blur(6px);
  color: var(--text-2);
  font-size: 12px;
}
.path-status {
  border-color: rgb(61 139 255 / 0.5);
  color: #7cb2ff;
}
.status .btn {
  margin-left: 4px;
}
.gold-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--gold);
  box-shadow: 0 0 0 2px #fff;
}
.coords {
  color: var(--text-3);
}

@media (max-width: 760px) {
  .map-frame.editing {
    flex-direction: column;
    height: auto;
  }
  .map-frame.editing .dock {
    width: 100%;
    height: auto;
    max-height: 420px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .map-frame.editing .map-main {
    height: min(620px, 70vh);
  }
  .rehearse-btn {
    margin-left: 0;
  }
}
</style>
