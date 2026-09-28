<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLayer } from '@/composables/useLayer'
import { getImageUrl, peekImageUrl } from '@/lib/imageCache'
import { useUi } from '@/stores/ui'
import type { ImageSource } from '@/types'
import Icon from './Icon.vue'

/** 图片查看器：左右切换、滚轮 / 双指缩放、拖动平移、双击放大 */
const ui = useUi()
const state = computed(() => ui.lightbox)
const open = computed(() => !!state.value)
const index = ref(0)
const url = ref<string | null>(null)
const thumbUrls = ref<(string | null)[]>([])

// 缩放 / 平移状态
const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const stage = ref<HTMLElement>()
const imgEl = ref<HTMLImageElement>()
/** 捏合 / 放大动画时临时关闭 transform 过渡 */
const animating = ref(false)

function resetZoom() {
  scale.value = 1
  tx.value = 0
  ty.value = 0
}

useLayer(open, () => ui.closeLightbox())

const total = computed(() => state.value?.sources.length ?? 0)

async function resolve(src: ImageSource, variant: 'full' | 'thumb') {
  if (src.kind === 'url') return src.url
  return peekImageUrl(src.id, variant) ?? (await getImageUrl(src.id, variant))
}

watch(
  state,
  async (s) => {
    if (!s) return
    index.value = s.index
    thumbUrls.value = s.sources.map(() => null)
    const thumbs = await Promise.all(s.sources.map((src) => resolve(src, 'thumb')))
    if (state.value === s) thumbUrls.value = thumbs
  },
  { immediate: true },
)

watch(
  [state, index],
  async ([s, i]) => {
    resetZoom()
    if (!s) {
      url.value = null
      return
    }
    const src = s.sources[i]!
    // 先显示缩略图，原图加载完成后替换
    url.value = src.kind === 'stored' ? (peekImageUrl(src.id, 'full') ?? peekImageUrl(src.id, 'thumb') ?? null) : src.url
    const full = await resolve(src, 'full')
    if (state.value === s && index.value === i) url.value = full
  },
  { immediate: true },
)

function go(delta: number) {
  if (total.value < 2) return
  index.value = (index.value + delta + total.value) % total.value
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'ArrowLeft') go(-1)
  else if (e.key === 'ArrowRight') go(1)
}
watch(open, (v) => {
  if (v) window.addEventListener('keydown', onKeydown)
  else {
    window.removeEventListener('keydown', onKeydown)
    pointers.clear()
    gesture = null
    lastTap = null
  }
})

// ---- 缩放 / 平移 ----
// 电脑：滚轮缩放、双击放大、拖动平移；手机：双指捏合缩放、双击放大、单指拖动平移、左右滑动切换
const MAX_SCALE = 8

/** 图片中心相对舞台中心的偏移为 (tx, ty)；限制平移范围，避免把图片拖出屏幕 */
function clampPan() {
  const el = stage.value
  const img = imgEl.value
  if (!el || !img) return
  const w = img.offsetWidth * scale.value
  const h = img.offsetHeight * scale.value
  const maxX = Math.max(0, (w - el.clientWidth) / 2)
  const maxY = Math.max(0, (h - el.clientHeight) / 2)
  tx.value = Math.min(maxX, Math.max(-maxX, tx.value))
  ty.value = Math.min(maxY, Math.max(-maxY, ty.value))
}

function stageCenter() {
  const r = stage.value!.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

/** 以屏幕上的 (clientX, clientY) 为中心缩放到 next 倍 */
function zoomAt(clientX: number, clientY: number, next: number) {
  if (!stage.value) return
  const c = stageCenter()
  const cx = clientX - c.x
  const cy = clientY - c.y
  const s = Math.min(MAX_SCALE, Math.max(1, next))
  const k = s / scale.value
  tx.value = cx - (cx - tx.value) * k
  ty.value = cy - (cy - ty.value) * k
  scale.value = s
  if (s === 1) resetZoom()
  else clampPan()
}

/** 双击 / 双击屏幕：未放大时放大到 2.5 倍，已放大时还原 */
function toggleZoom(clientX: number, clientY: number) {
  animating.value = true
  zoomAt(clientX, clientY, scale.value > 1 ? 1 : 2.5)
  setTimeout(() => (animating.value = false), 220)
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  zoomAt(e.clientX, e.clientY, scale.value * Math.exp(-e.deltaY * 0.002))
}

let lastPointerType = 'mouse'
function onDblClick(e: MouseEvent) {
  // 触屏的双击由下面的 pointer 事件自己判断，这里只处理鼠标
  if (lastPointerType === 'mouse') toggleZoom(e.clientX, e.clientY)
}

/** 点击图片以外的空白处关闭查看器 */
function isOnImage(x: number, y: number) {
  const img = imgEl.value
  if (!img) return false
  const r = img.getBoundingClientRect()
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

type Pt = { x: number; y: number }
const pointers = new Map<number, Pt>()
let gesture: {
  start: Pt
  tx: number
  ty: number
  moved: boolean
  /** 做过双指缩放：松手后不再当作点击 / 滑动 */
  pinched: boolean
  pinch?: { dist: number; scale: number; mid: Pt; tx: number; ty: number }
} | null = null
let lastTap: { t: number; x: number; y: number } | null = null

function pinchInfo() {
  const [a, b] = [...pointers.values()] as [Pt, Pt]
  return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
}

function onPointerDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  lastPointerType = e.pointerType
  // 新一轮触摸的第一根手指：清掉可能残留的旧触点（个别浏览器松手时不发 pointerup）
  if (e.isPrimary) pointers.clear()
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size === 1) {
    gesture = { start: { x: e.clientX, y: e.clientY }, tx: tx.value, ty: ty.value, moved: false, pinched: false }
  } else if (pointers.size === 2 && gesture) {
    const { dist, mid } = pinchInfo()
    gesture.moved = true
    gesture.pinched = true
    gesture.pinch = { dist, scale: scale.value, mid, tx: tx.value, ty: ty.value }
  }
}

function onPointerMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId) || !gesture) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  // 双指捏合：以两指中点为中心缩放，同时跟随中点平移
  if (gesture.pinch && pointers.size >= 2) {
    const p = gesture.pinch
    const { dist, mid } = pinchInfo()
    const s = Math.min(MAX_SCALE, Math.max(1, (p.scale * dist) / p.dist))
    const c = stageCenter()
    // 捏合开始时两指中点下的图片位置，保持在当前中点下
    const ix = (p.mid.x - c.x - p.tx) / p.scale
    const iy = (p.mid.y - c.y - p.ty) / p.scale
    scale.value = s
    tx.value = mid.x - c.x - s * ix
    ty.value = mid.y - c.y - s * iy
    clampPan()
    return
  }

  const dx = e.clientX - gesture.start.x
  const dy = e.clientY - gesture.start.y
  if (!gesture.moved && Math.hypot(dx, dy) > 6) gesture.moved = true
  if (scale.value > 1) {
    tx.value = gesture.tx + dx
    ty.value = gesture.ty + dy
    clampPan()
  }
}

function onPointerUp(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return
  pointers.delete(e.pointerId)
  const g = gesture
  if (!g) return

  // 双指中松开一根手指：剩下的手指继续拖动
  if (pointers.size > 0) {
    const [rest] = [...pointers.values()] as [Pt]
    gesture = { start: rest, tx: tx.value, ty: ty.value, moved: true, pinched: true }
    return
  }
  gesture = null
  if (scale.value < 1.05) resetZoom()
  if (e.type === 'pointercancel' || g.pinched) return

  const dx = e.clientX - g.start.x
  const dy = e.clientY - g.start.y

  // 未放大时左右滑动切换图片
  if (scale.value === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    go(dx < 0 ? 1 : -1)
    return
  }
  if (g.moved) return

  // 触屏：自己判断双击
  if (e.pointerType !== 'mouse') {
    const now = performance.now()
    if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
      lastTap = null
      clearTimeout(tapTimer)
      toggleZoom(e.clientX, e.clientY)
      return
    }
    lastTap = { t: now, x: e.clientX, y: e.clientY }
    // 单击空白处关闭：等一下，确认不是双击的第一下
    if (scale.value === 1 && !isOnImage(e.clientX, e.clientY)) {
      const x = e.clientX
      const y = e.clientY
      clearTimeout(tapTimer)
      tapTimer = setTimeout(() => {
        if (lastTap && lastTap.x === x && lastTap.y === y) ui.closeLightbox()
      }, 330)
    }
    return
  }
  if (scale.value === 1 && !isOnImage(e.clientX, e.clientY)) ui.closeLightbox()
}
let tapTimer: ReturnType<typeof setTimeout> | undefined
</script>

<template>
  <Teleport to="body">
    <Transition name="lb">
      <div v-if="state" class="lightbox" role="dialog" aria-modal="true" aria-label="查看图片">
        <header class="bar">
          <span class="title ellipsis">{{ state.title }}</span>
          <span v-if="total > 1" class="counter tabular">{{ index + 1 }} / {{ total }}</span>
          <span v-if="scale > 1" class="zoom tabular">{{ Math.round(scale * 100) }}%</span>
          <button type="button" class="btn btn-ghost btn-icon" aria-label="关闭" @click="ui.closeLightbox()">
            <Icon name="x" :size="22" />
          </button>
        </header>

        <div
          ref="stage"
          class="stage"
          :class="{ zoomed: scale > 1 }"
          @wheel="onWheel"
          @dblclick="onDblClick"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <img
            v-if="url"
            ref="imgEl"
            :src="url"
            alt=""
            draggable="false"
            :class="{ animating }"
            :style="{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }"
          />
        </div>

        <button v-if="total > 1" type="button" class="nav prev" aria-label="上一张" @click="go(-1)">
          <Icon name="chevronLeft" :size="28" />
        </button>
        <button v-if="total > 1" type="button" class="nav next" aria-label="下一张" @click="go(1)">
          <Icon name="chevronRight" :size="28" />
        </button>

        <footer v-if="total > 1" class="strip">
          <button
            v-for="(t, i) in thumbUrls"
            :key="i"
            type="button"
            class="strip-item"
            :class="{ active: i === index }"
            :aria-label="`第 ${i + 1} 张`"
            @click="index = i"
          >
            <img v-if="t" :src="t" alt="" draggable="false" />
          </button>
        </footer>
        <p class="hint desktop">滚轮缩放 · 双击放大 · <span class="kbd">←</span> <span class="kbd">→</span> 切换 · <span class="kbd">Esc</span> 关闭</p>
        <p class="hint touch">双指缩放 · 双击放大 / 还原 · 放大后单指拖动 · 左右滑动切换</p>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.lightbox {
  position: fixed;
  inset: 0;
  z-index: var(--z-lightbox);
  display: flex;
  flex-direction: column;
  background: rgb(4 7 10 / 0.94);
  backdrop-filter: blur(6px);
}
.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 20px;
}
.title {
  flex: 1;
  font-weight: 700;
}
.counter,
.zoom {
  color: var(--text-2);
  font-size: 13px;
}
.stage {
  position: relative;
  display: grid;
  flex: 1;
  place-items: center;
  min-height: 0;
  overflow: hidden;
  padding: 0 64px;
  cursor: zoom-in;
  touch-action: none;
}
.stage.zoomed {
  cursor: grab;
}
.stage img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--r-sm);
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.5);
  user-select: none;
  pointer-events: none;
  transform-origin: center;
}
.stage img.animating {
  transition: transform 0.2s var(--ease);
}
.nav {
  position: absolute;
  top: 50%;
  display: grid;
  place-items: center;
  width: 48px;
  height: 64px;
  margin-top: -32px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r);
  background: rgb(18 27 34 / 0.8);
  color: var(--text);
}
.nav:hover {
  background: var(--surface-3);
}
.prev {
  left: 12px;
}
.next {
  right: 12px;
}
.strip {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  overflow-x: auto;
}
.strip-item {
  flex: none;
  width: 72px;
  height: 44px;
  padding: 0;
  overflow: hidden;
  border: 2px solid transparent;
  border-radius: var(--r-sm);
  background: var(--surface);
  opacity: 0.55;
}
.strip-item.active {
  border-color: var(--cyan);
  opacity: 1;
}
.strip-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.hint {
  padding: 0 12px 12px;
  color: var(--text-3);
  font-size: 12px;
  text-align: center;
}
/* 触屏设备显示手势提示，电脑显示键盘 / 鼠标提示 */
.hint.touch {
  display: none;
}
@media (hover: none) and (pointer: coarse) {
  .hint.desktop {
    display: none;
  }
  .hint.touch {
    display: block;
  }
}
.lb-enter-active,
.lb-leave-active {
  transition: opacity 0.18s var(--ease);
}
.lb-enter-from,
.lb-leave-to {
  opacity: 0;
}
@media (max-width: 640px) {
  .stage {
    padding: 0 8px;
  }
  .nav {
    display: none;
  }
}
</style>
