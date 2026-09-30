<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { POS_MAX, type Position } from '@/types'
import type { Bounds } from '@/lib/geometry'
import { fromUnit } from '@/lib/positions'

/**
 * 地图画布：滚轮 / 双指缩放、拖动平移、双击新建。
 * 标记点不随地图一起缩放（始终保持同样大小），由父组件通过默认插槽渲染，
 * 插槽参数 at(pos) 给出标记点相对地图左上角的位置（CSS），px(pos) 给出数值，size 为地图当前的显示尺寸。
 *
 * tool = 'draw' 时为画笔模式（画路径、圈选区域）：
 * 在地图图片上按住左键拖动画线（draw-start / draw-move / draw-end），单击为 draw-tap；
 * 右键 / 中键拖动、按住空格拖动、或在图片外拖动时仍然平移地图；触屏双指缩放平移。
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
    /** pan：拖动平移（默认）；draw：画笔 */
    tool?: 'pan' | 'draw'
  }>(),
  {
    viewKey: '',
    wheelZoom: 'always',
    tool: 'pan',
    padding: () => ({ top: 24, right: 24, bottom: 24, left: 24 }),
    maxScale: 8,
  },
)

interface PointerPayload {
  pos: Position
  clientX: number
  clientY: number
}

const emit = defineEmits<{
  'map-dblclick': [payload: PointerPayload]
  'background-click': [payload: { clientX: number; clientY: number }]
  'view-change': []
  'gesture-start': []
  /** 画笔：开始画线（pos 为按下的位置） */
  'draw-start': [payload: PointerPayload]
  'draw-move': [payload: PointerPayload]
  'draw-end': [payload: PointerPayload]
  /** 画线被打断（例如触屏上第二根手指按下） */
  'draw-cancel': []
  /** 画笔模式下单击（没有拖动） */
  'draw-tap': [payload: PointerPayload]
  /** 画笔模式下鼠标悬停（用于显示吸附提示），离开地图时为 null */
  'draw-hover': [payload: PointerPayload | null]
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

/** 可视区域（去掉四周留白）中心对应的地图坐标 */
function centerPos() {
  const r = viewport.value?.getBoundingClientRect() ?? { left: 0, top: 0 }
  const p = props.padding
  const x = r.left + p.left + (size.vw - p.left - p.right) / 2
  const y = r.top + p.top + (size.vh - p.top - p.bottom) / 2
  return clientToPos(x, y).pos
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

/** bounds 内的点是否都在视口内 */
function isBoundsVisible(b: Bounds, margin = 40) {
  return (
    isPosVisible({ x: b.minX, y: b.minY }, margin) &&
    isPosVisible({ x: b.maxX, y: b.maxY }, margin)
  )
}

/**
 * 让 bounds 整个出现在视口里：已经完整可见时不动；
 * 否则保持当前缩放（放不下时缩小）并把它移到可视区域中间。
 */
function fitBounds(b: Bounds, margin = 60) {
  if (isBoundsVisible(b, margin)) return false
  const p = props.padding
  const availW = Math.max(40, size.vw - p.left - p.right - margin * 2)
  const availH = Math.max(40, size.vh - p.top - p.bottom - margin * 2)
  const bw = ((b.maxX - b.minX) / POS_MAX) * base.value.w
  const bh = ((b.maxY - b.minY) / POS_MAX) * base.value.h
  const fit = Math.min(bw ? availW / bw : Infinity, bh ? availH / bh : Infinity)
  const scale = Math.max(1, Math.min(view.scale, fit, props.maxScale))
  const w = base.value.w * scale
  const h = base.value.h * scale
  const cx = p.left + (size.vw - p.left - p.right) / 2
  const cy = p.top + (size.vh - p.top - p.bottom) / 2
  const tx = cx - (((b.minX + b.maxX) / 2) / POS_MAX) * w
  const ty = cy - (((b.minY + b.maxY) / 2) / POS_MAX) * h
  if (scale === 1) {
    animateTo(1, p.left + (base.value.availW - base.value.w) / 2, p.top + (base.value.availH - base.value.h) / 2)
    return true
  }
  animateTo(scale, tx, ty)
  return true
}

export interface ViewState {
  scale: number
  tx: number
  ty: number
}

function getViewState(): ViewState {
  return { scale: view.scale, tx: view.tx, ty: view.ty }
}

function restoreView(state: ViewState) {
  cancelAnimationFrame(anim)
  animateTo(state.scale, state.tx, state.ty, 260)
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
/** 画笔：按下后移动超过几个像素才算开始画线，否则当作单击 */
let stroke: { pointerId: number; x: number; y: number; start: PointerPayload; started: boolean } | null = null
/** 按住空格时，画笔模式下也可以拖动平移（只在鼠标位于地图上时生效） */
const spaceDown = ref(false)
let pointerOver = false
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

function isOnMapUi(e: Event) {
  return !!(e.target as HTMLElement).closest('[data-map-ui]')
}

function payload(e: { clientX: number; clientY: number }): PointerPayload {
  return { pos: clientToPos(e.clientX, e.clientY).pos, clientX: e.clientX, clientY: e.clientY }
}

/** 画笔模式下按下：在图片上用左键 / 单指画线，其余情况平移 */
function onDrawPointerDown(e: PointerEvent) {
  if (isOnMapUi(e)) return
  const isMouse = e.pointerType === 'mouse'
  const panButton = isMouse && (e.button === 1 || e.button === 2 || (e.button === 0 && spaceDown.value))
  if (isMouse && !panButton && e.button !== 0) return
  // 中键拖动平移：阻止浏览器的自动滚动
  if (e.button === 1) e.preventDefault()
  const second = !isMouse && pointers.size >= 1
  if (!panButton && !second && !stroke && clientToPos(e.clientX, e.clientY).inside) {
    cancelAnimationFrame(anim)
    viewport.value!.setPointerCapture(e.pointerId)
    const p = localPoint(e.clientX, e.clientY)
    pointers.set(e.pointerId, p)
    stroke = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, start: payload(e), started: false }
    emit('draw-hover', null)
    return
  }
  if (second && stroke) {
    // 第二根手指按下：改为双指缩放，丢弃正在画的线
    if (stroke.started) emit('draw-cancel')
    const first = pointers.get(stroke.pointerId)
    stroke = null
    if (first) gesture = { startX: first.x, startY: first.y, tx: view.tx, ty: view.ty, moved: false }
  }
  startGesture(e)
}

function onPointerDown(e: PointerEvent) {
  if (props.tool === 'draw') {
    onDrawPointerDown(e)
    return
  }
  if (isOnMarker(e)) return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  startGesture(e)
}

function startGesture(e: PointerEvent) {
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
  if (stroke && e.pointerId === stroke.pointerId) {
    // 记录最新位置：画线途中第二根手指按下时，从这里开始双指缩放
    pointers.set(e.pointerId, localPoint(e.clientX, e.clientY))
    if (!stroke.started) {
      if (Math.hypot(e.clientX - stroke.x, e.clientY - stroke.y) < 3) return
      stroke.started = true
      emit('draw-start', stroke.start)
    }
    emit('draw-move', payload(e))
    return
  }
  if (props.tool === 'draw' && !pointers.size && e.pointerType === 'mouse') {
    const { inside } = clientToPos(e.clientX, e.clientY)
    emit('draw-hover', inside && !isOnMapUi(e) ? payload(e) : null)
  }
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
  if (stroke && e.pointerId === stroke.pointerId) {
    const s = stroke
    stroke = null
    pointers.delete(e.pointerId)
    if (e.type === 'pointercancel') {
      if (s.started) emit('draw-cancel')
    } else if (s.started) {
      emit('draw-end', payload(e))
    } else {
      emit('draw-tap', s.start)
    }
    return
  }
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
  if (e.type === 'pointercancel' || props.tool === 'draw') return
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
  if (props.tool === 'draw' || isOnMarker(e) || suppressDblClick) return
  emitDblClick(e.clientX, e.clientY)
}

function onContextMenu(e: MouseEvent) {
  // 画笔模式下右键用来拖动平移
  if (props.tool === 'draw') e.preventDefault()
}

function onPointerEnter(e: PointerEvent) {
  if (e.pointerType === 'mouse') pointerOver = true
}

function onPointerLeave(e: PointerEvent) {
  if (e.pointerType === 'mouse') pointerOver = false
  if (props.tool === 'draw' && e.pointerType === 'mouse' && !stroke) emit('draw-hover', null)
}

// 画笔模式：按住空格临时切换为平移
function isTyping(e: KeyboardEvent) {
  return !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')
}
function onKeyDown(e: KeyboardEvent) {
  if (e.code !== 'Space' || props.tool !== 'draw' || !pointerOver || isTyping(e)) return
  e.preventDefault()
  spaceDown.value = true
}
function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') spaceDown.value = false
}
function onWindowBlur() {
  spaceDown.value = false
}

watch(
  () => props.tool,
  (tool) => {
    // 切换工具时丢弃正在画的线
    if (stroke) {
      if (stroke.started) emit('draw-cancel')
      pointers.delete(stroke.pointerId)
      stroke = null
    }
    if (tool === 'draw') {
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)
      window.addEventListener('blur', onWindowBlur)
    } else {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onWindowBlur)
      spaceDown.value = false
    }
  },
  { immediate: true },
)

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
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onWindowBlur)
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

/** 地图坐标 → 相对地图左上角的像素位置（数值，供 SVG 使用） */
function px(pos: Position) {
  return { x: (pos.x / POS_MAX) * mapW.value, y: (pos.y / POS_MAX) * mapH.value }
}

const mapSize = computed(() => ({ w: mapW.value, h: mapH.value }))
/** 地图图片的高 / 宽 */
const aspect = computed(() => natural.h / natural.w)

defineExpose({
  centerPos,
  clientToPos,
  posToClient,
  pxPerUnit,
  isPosVisible,
  isBoundsVisible,
  focusOn,
  fitBounds,
  zoomBy,
  resetView,
  getViewState,
  restoreView,
  view,
  aspect,
})
</script>

<template>
  <div
    ref="viewport"
    class="map-viewport"
    :class="{ panning, 'tool-draw': tool === 'draw', 'space-pan': tool === 'draw' && spaceDown }"
    @wheel="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @dblclick="onDblClick"
    @contextmenu="onContextMenu"
  >
    <slot name="background" />
    <div class="stage" :style="stageStyle">
      <img :src="src" alt="" draggable="false" @load="onImageLoad" />
    </div>
    <div class="marker-layer" :style="layerStyle">
      <slot :at="at" :px="px" :size="mapSize" :scale="view.scale" />
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
/* 画笔光标：笔尖在左下角 */
.map-viewport.tool-draw {
  cursor:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21.17 6.81a1 1 0 0 0-3.98-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z' stroke='%230a0f13' stroke-width='3.6'/%3E%3Cpath d='M21.17 6.81a1 1 0 0 0-3.98-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z' stroke='%23ffffff' stroke-width='1.6' fill='%2378fbe7' fill-opacity='0.35'/%3E%3Cpath d='m15 5 4 4' stroke='%23ffffff' stroke-width='1.6'/%3E%3C/svg%3E")
      2 22,
    crosshair;
}
.map-viewport.tool-draw.space-pan {
  cursor: grab;
}
.map-viewport.tool-draw.panning {
  cursor: grabbing;
}
/* 画笔模式下标记点不响应鼠标，可以直接在它们上面画线 */
.map-viewport.tool-draw .marker-layer :deep(*) {
  pointer-events: none !important;
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
