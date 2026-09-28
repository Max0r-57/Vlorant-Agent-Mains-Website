<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { POS_MAX, type Position } from '@/types'
import { fromUnit } from '@/lib/positions'

/**
 * 地图画布：滚轮 / 双指缩放、拖动平移、双击新建。
 * 标记点不随地图一起缩放（始终保持同样大小），由父组件通过默认插槽渲染，
 * 插槽参数 at(pos) 给出标记点相对地图左上角的位置。
 */
const props = withDefaults(
  defineProps<{
    src: string
    /** 变化时重置视图（例如切换地图） */
    viewKey?: string
    /** 适应窗口时四周留白 */
    padding?: { top: number; right: number; bottom: number; left: number }
    maxScale?: number
    /** always：滚轮直接缩放；ctrl：需要按住 Ctrl（嵌在可滚动页面里时，避免滚动页面时误缩放） */
    wheelZoom?: 'always' | 'ctrl'
  }>(),
  {
    viewKey: '',
    wheelZoom: 'always',
    padding: () => ({ top: 24, right: 24, bottom: 24, left: 24 }),
    maxScale: 8,
  },
)

const emit = defineEmits<{
  'map-dblclick': [payload: { pos: Position; clientX: number; clientY: number }]
  'background-click': [payload: { clientX: number; clientY: number }]
  'view-change': []
  'gesture-start': []
}>()

const viewport = ref<HTMLElement>()
const size = reactive({ vw: 0, vh: 0 })
const natural = reactive({ w: 1, h: 1, loaded: false })
const view = reactive({ scale: 1, tx: 0, ty: 0 })
const panning = ref(false)

// ---------- 尺寸 ----------
const base = computed(() => {
  const p = props.padding
  const availW = Math.max(80, size.vw - p.left - p.right)
  const availH = Math.max(80, size.vh - p.top - p.bottom)
  const aspect = natural.w / natural.h
  let w = availW
  let h = w / aspect
  if (h > availH) {
    h = availH
    w = h * aspect
  }
  return { w, h, availW, availH }
})

const mapW = computed(() => base.value.w * view.scale)
const mapH = computed(() => base.value.h * view.scale)

function fitView() {
  const p = props.padding
  view.scale = 1
  view.tx = p.left + (base.value.availW - base.value.w) / 2
  view.ty = p.top + (base.value.availH - base.value.h) / 2
  emit('view-change')
}

/** 限制平移范围：地图至少有一部分留在可视区域内 */
function clampView() {
  const minX = Math.min(mapW.value, size.vw) * 0.3
  const minY = Math.min(mapH.value, size.vh) * 0.3
  view.tx = Math.min(size.vw - minX, Math.max(minX - mapW.value, view.tx))
  view.ty = Math.min(size.vh - minY, Math.max(minY - mapH.value, view.ty))
}

function setView(scale: number, tx: number, ty: number) {
  view.scale = scale
  view.tx = tx
  view.ty = ty
  clampView()
  emit('view-change')
}

function zoomAt(localX: number, localY: number, nextScale: number) {
  const s = Math.min(props.maxScale, Math.max(1, nextScale))
  const k = s / view.scale
  setView(s, localX - (localX - view.tx) * k, localY - (localY - view.ty) * k)
  if (s === 1) fitView()
}

// ---------- 坐标换算 ----------
function localPoint(clientX: number, clientY: number) {
  const r = viewport.value!.getBoundingClientRect()
  return { x: clientX - r.left, y: clientY - r.top }
}

/** 屏幕坐标 → 地图坐标；inside 为 false 表示点在地图图片外 */
function clientToPos(clientX: number, clientY: number) {
  const p = localPoint(clientX, clientY)
  const ux = (p.x - view.tx) / mapW.value
  const uy = (p.y - view.ty) / mapH.value
  return { pos: fromUnit(ux, uy), inside: ux >= 0 && ux <= 1 && uy >= 0 && uy <= 1 }
}

/** 地图坐标 → 屏幕坐标（clientX / clientY） */
function posToClient(pos: Position) {
  const r = viewport.value?.getBoundingClientRect() ?? { left: 0, top: 0 }
  return {
    x: r.left + view.tx + (pos.x / POS_MAX) * mapW.value,
    y: r.top + view.ty + (pos.y / POS_MAX) * mapH.value,
  }
}

/** 每个坐标单位对应多少屏幕像素 */
function pxPerUnit() {
  return { x: mapW.value / POS_MAX, y: mapH.value / POS_MAX }
}

function isPosVisible(pos: Position, margin = 40) {
  const x = view.tx + (pos.x / POS_MAX) * mapW.value
  const y = view.ty + (pos.y / POS_MAX) * mapH.value
  return x >= margin && y >= margin && x <= size.vw - margin && y <= size.vh - margin
}

/** 标记点位置（相对地图左上角），供插槽使用 */
function at(pos: Position) {
  return {
    left: `${(pos.x / POS_MAX) * mapW.value}px`,
    top: `${(pos.y / POS_MAX) * mapH.value}px`,
  }
}

// ---------- 动画 ----------
let anim = 0
function animateTo(scale: number, tx: number, ty: number, duration = 320) {
  cancelAnimationFrame(anim)
  const from = { ...view }
  const start = performance.now()
  const ease = (t: number) => 1 - Math.pow(1 - t, 3)
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration)
    const k = ease(t)
    view.scale = from.scale + (scale - from.scale) * k
    view.tx = from.tx + (tx - from.tx) * k
    view.ty = from.ty + (ty - from.ty) * k
    emit('view-change')
    if (t < 1) anim = requestAnimationFrame(step)
  }
  anim = requestAnimationFrame(step)
}

/** 平移（必要时放大）使 pos 位于视口中心；已经在视口内且不要求居中时不移动 */
function focusOn(pos: Position, opts: { minScale?: number; force?: boolean } = {}) {
  const scale = Math.max(view.scale, opts.minScale ?? view.scale)
  if (!opts.force && scale === view.scale && isPosVisible(pos, 80)) return false
  const w = base.value.w * scale
  const h = base.value.h * scale
  const tx = size.vw / 2 - (pos.x / POS_MAX) * w
  const ty = size.vh / 2 - (pos.y / POS_MAX) * h
  animateTo(scale, tx, ty)
  return true
}

function zoomBy(factor: number) {
  cancelAnimationFrame(anim)
  const s = Math.min(props.maxScale, Math.max(1, view.scale * factor))
  if (s === 1) {
    const p = props.padding
    animateTo(1, p.left + (base.value.availW - base.value.w) / 2, p.top + (base.value.availH - base.value.h) / 2, 220)
    return
  }
  const cx = size.vw / 2
  const cy = size.vh / 2
  const k = s / view.scale
  animateTo(s, cx - (cx - view.tx) * k, cy - (cy - view.ty) * k, 220)
}

function resetView() {
  cancelAnimationFrame(anim)
  const p = props.padding
  animateTo(1, p.left + (base.value.availW - base.value.w) / 2, p.top + (base.value.availH - base.value.h) / 2, 260)
}

// ---------- 交互 ----------
const wheelHint = ref(false)
let wheelHintTimer = 0

function onWheel(e: WheelEvent) {
  // 触控板双指缩放在浏览器里表现为 ctrlKey + wheel，所以同样可用
  if (props.wheelZoom === 'ctrl' && !e.ctrlKey && !e.metaKey) {
    wheelHint.value = true
    window.clearTimeout(wheelHintTimer)
    wheelHintTimer = window.setTimeout(() => (wheelHint.value = false), 1400)
    return
  }
  e.preventDefault()
  cancelAnimationFrame(anim)
  emit('gesture-start')
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? size.vh : 1
  const dy = e.deltaY * unit
  const factor = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018))
  const p = localPoint(e.clientX, e.clientY)
  zoomAt(p.x, p.y, view.scale * factor)
}

const pointers = new Map<number, { x: number; y: number }>()
let gesture: {
  startX: number
  startY: number
  tx: number
  ty: number
  moved: boolean
  pinch?: { dist: number; scale: number; midX: number; midY: number; tx: number; ty: number }
} | null = null
let suppressDblClick = false
let lastTap: { t: number; x: number; y: number } | null = null

function isOnMarker(e: Event) {
  return !!(e.target as HTMLElement).closest('[data-marker], [data-map-ui]')
}

function onPointerDown(e: PointerEvent) {
  if (isOnMarker(e)) return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  cancelAnimationFrame(anim)
  viewport.value!.setPointerCapture(e.pointerId)
  const p = localPoint(e.clientX, e.clientY)
  pointers.set(e.pointerId, p)
  if (pointers.size === 1) {
    gesture = { startX: p.x, startY: p.y, tx: view.tx, ty: view.ty, moved: false }
    suppressDblClick = false
  } else if (pointers.size === 2 && gesture) {
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }]
    gesture.moved = true
    gesture.pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      scale: view.scale,
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      tx: view.tx,
      ty: view.ty,
    }
  }
}

function onPointerMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId) || !gesture) return
  const p = localPoint(e.clientX, e.clientY)
  pointers.set(e.pointerId, p)
  if (gesture.pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }]
    const pinch = gesture.pinch
    const s = Math.min(props.maxScale, Math.max(1, (pinch.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.dist))
    const midX = (a.x + b.x) / 2
    const midY = (a.y + b.y) / 2
    const k = s / pinch.scale
    setView(s, midX - (pinch.midX - pinch.tx) * k, midY - (pinch.midY - pinch.ty) * k)
    return
  }
  const dx = p.x - gesture.startX
  const dy = p.y - gesture.startY
  if (!gesture.moved && Math.hypot(dx, dy) < 4) return
  if (!gesture.moved) emit('gesture-start')
  gesture.moved = true
  panning.value = true
  setView(view.scale, gesture.tx + dx, gesture.ty + dy)
}

function onPointerUp(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return
  pointers.delete(e.pointerId)
  if (pointers.size > 0) {
    // 双指缩放结束后，剩下的手指继续平移
    if (gesture) {
      const [rest] = [...pointers.values()] as [{ x: number; y: number }]
      gesture = { startX: rest.x, startY: rest.y, tx: view.tx, ty: view.ty, moved: true }
    }
    return
  }
  const g = gesture
  gesture = null
  panning.value = false
  if (!g) return
  if (g.moved) {
    suppressDblClick = true
    if (view.scale <= 1.001) fitView()
    return
  }
  if (e.type === 'pointercancel') return
  emit('background-click', { clientX: e.clientX, clientY: e.clientY })
  // 触屏没有可靠的 dblclick，自己判断双击
  if (e.pointerType !== 'mouse') {
    const now = performance.now()
    if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 24) {
      lastTap = null
      emitDblClick(e.clientX, e.clientY)
    } else {
      lastTap = { t: now, x: e.clientX, y: e.clientY }
    }
  }
}

function emitDblClick(clientX: number, clientY: number) {
  const { pos, inside } = clientToPos(clientX, clientY)
  if (inside) emit('map-dblclick', { pos, clientX, clientY })
}

function onDblClick(e: MouseEvent) {
  if (isOnMarker(e) || suppressDblClick) return
  emitDblClick(e.clientX, e.clientY)
}

// ---------- 生命周期 ----------
let ro: ResizeObserver | null = null
onMounted(() => {
  ro = new ResizeObserver(([entry]) => {
    const r = entry!.contentRect
    // 页面被 KeepAlive 缓存时元素脱离文档，尺寸为 0，忽略即可保留当前视图
    if (!r.width || !r.height) return
    const wasFit = view.scale === 1
    // 记住视口中心对应的地图位置，尺寸变化后保持不变
    const cx = size.vw ? (size.vw / 2 - view.tx) / mapW.value : 0.5
    const cy = size.vh ? (size.vh / 2 - view.ty) / mapH.value : 0.5
    size.vw = r.width
    size.vh = r.height
    if (wasFit || !natural.loaded) fitView()
    else setView(view.scale, size.vw / 2 - cx * mapW.value, size.vh / 2 - cy * mapH.value)
  })
  ro.observe(viewport.value!)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  cancelAnimationFrame(anim)
  window.clearTimeout(wheelHintTimer)
})

function onImageLoad(e: Event) {
  const img = e.target as HTMLImageElement
  natural.w = img.naturalWidth || 1
  natural.h = img.naturalHeight || 1
  natural.loaded = true
  fitView()
}

watch(
  () => [props.viewKey, props.padding.top, props.padding.right, props.padding.bottom, props.padding.left],
  () => {
    cancelAnimationFrame(anim)
    fitView()
  },
)

const stageStyle = computed(() => ({
  width: `${base.value.w}px`,
  height: `${base.value.h}px`,
  transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
}))

const layerStyle = computed(() => ({
  transform: `translate(${view.tx}px, ${view.ty}px)`,
}))

defineExpose({
  clientToPos,
  posToClient,
  pxPerUnit,
  isPosVisible,
  focusOn,
  zoomBy,
  resetView,
  view,
})
</script>

<template>
  <div
    ref="viewport"
    class="map-viewport"
    :class="{ panning }"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @dblclick="onDblClick"
  >
    <slot name="background" />
    <div class="stage" :style="stageStyle">
      <img :src="src" alt="" draggable="false" @load="onImageLoad" />
    </div>
    <div class="marker-layer" :style="layerStyle">
      <slot :at="at" :scale="view.scale" />
    </div>
    <slot name="overlay" :scale="view.scale" />
    <Transition name="fade">
      <div v-if="wheelHint" class="wheel-hint" aria-hidden="true">按住 <span class="kbd">Ctrl</span> 并滚动鼠标滚轮来缩放地图</div>
    </Transition>
  </div>
</template>

<style scoped>
.map-viewport {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 50%, rgb(21 40 57 / 0.35), transparent 70%),
    var(--bg);
  cursor: crosshair;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.map-viewport.panning {
  cursor: grabbing;
}
.stage {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
}
.stage img {
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.wheel-hint {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  background: rgb(5 8 11 / 0.55);
  color: var(--text);
  font-size: 15px;
  font-weight: 600;
  pointer-events: none;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s var(--ease);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.marker-layer {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}
</style>
