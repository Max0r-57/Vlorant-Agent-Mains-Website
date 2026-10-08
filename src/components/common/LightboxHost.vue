<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useLayer } from '@/composables/useLayer'
import { formatDuration } from '@/lib/format'
import { getImageUrl, getMediaInfo, peekImageUrl, peekMediaInfo, type MediaInfo } from '@/lib/imageCache'
import { useLineups } from '@/stores/lineups'
import { useUi } from '@/stores/ui'
import type { Annotation, ImageSource } from '@/types'
import AnnotationLayer from '@/components/media/AnnotationLayer.vue'
import ImageAnnotator from '@/components/media/ImageAnnotator.vue'
import Icon from './Icon.vue'

/**
 * 图片 / 视频查看器：左右切换；图片可以滚轮 / 双指缩放、拖动平移、双击放大，
 * 并且可以「编辑」添加标注；视频用浏览器自带的播放控件播放。
 */
const ui = useUi()
const store = useLineups()
const state = computed(() => ui.lightbox)
const open = computed(() => !!state.value)
/** 本地副本：给草稿图片保存标注后，替换成新的来源 */
const sources = shallowRef<ImageSource[]>([])
const index = ref(0)

interface View {
  info: MediaInfo | null
  /** 缩略图 / 视频封面 */
  poster: string | null
  /** 原图 / 视频 */
  full: string | null
}
const view = shallowRef<View>({ info: null, poster: null, full: null })
/** 尺寸未知时（个别草稿）用图片加载后的实际尺寸 */
const natural = ref<{ w: number; h: number } | null>(null)
const strip = shallowRef<{ thumb: string | null; video: boolean }[]>([])
const isVideo = computed(() => view.value.info?.kind === 'video')
const annotations = computed(() => view.value.info?.annotations ?? [])
const showAnnotations = ref(true)
const videoError = ref(false)
/** 正在编辑标注的图片：打开编辑器时记下，保存时下面的查看器重新加载也不影响编辑器 */
const editTarget = shallowRef<{
  src: string
  width: number
  height: number
  annotations: readonly Annotation[]
} | null>(null)
const editing = computed(() => !!editTarget.value)

// 缩放 / 平移状态
const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const stage = ref<HTMLElement>()
const frameEl = ref<HTMLElement>()
/** 捏合 / 放大动画时临时关闭 transform 过渡 */
const animating = ref(false)

function resetZoom() {
  scale.value = 1
  tx.value = 0
  ty.value = 0
}

useLayer(open, () => ui.closeLightbox())

const total = computed(() => sources.value.length)

function infoOfUrl(src: Extract<ImageSource, { kind: 'url' }>): MediaInfo {
  return {
    kind: src.media ?? 'image',
    width: src.width ?? 0,
    height: src.height ?? 0,
    duration: 0,
    annotations: src.annotations ?? [],
  }
}

function quickView(src: ImageSource): View {
  if (src.kind === 'url') return { info: infoOfUrl(src), poster: src.thumb ?? null, full: src.url }
  return {
    info: peekMediaInfo(src.id) ?? null,
    poster: peekImageUrl(src.id, 'thumb') ?? null,
    full: peekImageUrl(src.id, 'full') ?? null,
  }
}

async function loadView(src: ImageSource): Promise<View> {
  if (src.kind === 'url') return quickView(src)
  const [info, poster, full] = await Promise.all([
    getMediaInfo(src.id),
    getImageUrl(src.id, 'thumb'),
    getImageUrl(src.id, 'full'),
  ])
  return { info, poster, full }
}

async function loadStrip(list: ImageSource[]) {
  strip.value = list.map((src) => {
    const q = quickView(src)
    return { thumb: q.poster ?? (q.info?.kind === 'video' ? null : q.full), video: q.info?.kind === 'video' }
  })
  const items = await Promise.all(
    list.map(async (src) => {
      if (src.kind === 'url') {
        const info = infoOfUrl(src)
        return { thumb: src.thumb ?? (info.kind === 'video' ? null : src.url), video: info.kind === 'video' }
      }
      const [info, thumb] = await Promise.all([getMediaInfo(src.id), getImageUrl(src.id, 'thumb')])
      return { thumb, video: info?.kind === 'video' }
    }),
  )
  if (sources.value === list) strip.value = items
}

watch(
  state,
  (s) => {
    editTarget.value = null
    if (!s) {
      sources.value = []
      return
    }
    sources.value = s.sources
    index.value = s.index
    void loadStrip(s.sources)
  },
  { immediate: true },
)

let loadSeq = 0
async function loadCurrent() {
  const seq = ++loadSeq
  resetZoom()
  videoError.value = false
  natural.value = null
  const src = sources.value[index.value]
  if (!src) {
    view.value = { info: null, poster: null, full: null }
    return
  }
  // 先用已缓存的缩略图，原图 / 视频读出来后再替换
  view.value = quickView(src)
  const loaded = await loadView(src)
  if (seq === loadSeq) view.value = loaded
}

watch([sources, index], () => void loadCurrent(), { immediate: true })

function go(delta: number) {
  if (total.value < 2 || editing.value) return
  index.value = (index.value + delta + total.value) % total.value
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value || editing.value) return
  if ((e.target as HTMLElement | null)?.closest('video')) return
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
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// ---- 显示尺寸：按原图比例放进舞台（不放大小图），标注图层和图片使用同一个框 ----
const stageSize = ref({ w: 0, h: 0 })
const mediaSize = computed(() => {
  const info = view.value.info
  if (info && info.width > 0 && info.height > 0) return { w: info.width, h: info.height }
  return natural.value
})
const display = computed(() => {
  const m = mediaSize.value
  const s = stageSize.value
  if (!m || !s.w || !s.h) return null
  const k = Math.min(1, s.w / m.w, s.h / m.h)
  return { w: Math.max(1, Math.round(m.w * k)), h: Math.max(1, Math.round(m.h * k)) }
})

function measureStage() {
  const el = stage.value
  if (!el) return
  const cs = getComputedStyle(el)
  stageSize.value = {
    w: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
    h: el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
  }
}
const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measureStage) : null
watch(stage, (el, old) => {
  if (old) ro?.unobserve(old)
  if (el) {
    ro?.observe(el)
    measureStage()
  }
})
onBeforeUnmount(() => ro?.disconnect())

function onImageLoad(e: Event) {
  const img = e.target as HTMLImageElement
  if (!mediaSize.value && img.naturalWidth) natural.value = { w: img.naturalWidth, h: img.naturalHeight }
}

// ---- 标注编辑 ----
const canEdit = computed(() => {
  const src = sources.value[index.value]
  if (!src || isVideo.value || !view.value.full || !mediaSize.value) return false
  return src.kind === 'stored' || !!state.value?.annotateDraft
})

function startEdit() {
  const size = mediaSize.value
  if (!canEdit.value || !view.value.full || !size) return
  resetZoom()
  editTarget.value = { src: view.value.full, width: size.w, height: size.h, annotations: annotations.value }
}

async function saveAnnotations(list: Annotation[]) {
  const i = index.value
  const src = sources.value[i]
  if (!src) throw new Error('图片不存在')
  if (src.kind === 'stored') {
    await store.annotateImage(src.id, list)
  } else {
    const annotate = state.value?.annotateDraft
    if (!annotate) throw new Error('这张图片不能编辑')
    const next = await annotate(i, list)
    if (next) sources.value = sources.value.map((s, j) => (j === i ? next : s))
  }
  showAnnotations.value = true
  ui.toast(list.length ? '已保存标注' : '已清除标注')
  await loadCurrent()
  // 更新底部缩略图条里这一张的缩略图
  const fresh = await loadView(sources.value[i]!)
  strip.value = strip.value.map((t, j) => (j === i ? { thumb: fresh.poster ?? fresh.full, video: false } : t))
}

// ---- 缩放 / 平移 ----
// 电脑：滚轮缩放、双击放大、拖动平移；手机：双指捏合缩放、双击放大、单指拖动平移、左右滑动切换
const MAX_SCALE = 8

/** 图片中心相对舞台中心的偏移为 (tx, ty)；限制平移范围，避免把图片拖出屏幕 */
function clampPan() {
  const el = stage.value
  const d = display.value
  if (!el || !d) return
  const w = d.w * scale.value
  const h = d.h * scale.value
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
  if (isVideo.value) return
  e.preventDefault()
  zoomAt(e.clientX, e.clientY, scale.value * Math.exp(-e.deltaY * 0.002))
}

let lastPointerType = 'mouse'
function onDblClick(e: MouseEvent) {
  // 触屏的双击由下面的 pointer 事件自己判断，这里只处理鼠标；视频的双击交给播放器（全屏）
  if (lastPointerType === 'mouse' && !isVideo.value) toggleZoom(e.clientX, e.clientY)
}

/** 点击图片以外的空白处关闭查看器 */
function isOnImage(x: number, y: number) {
  const el = frameEl.value
  if (!el) return false
  const r = el.getBoundingClientRect()
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
  // 视频上的操作交给播放器自己的控件
  if ((e.target as HTMLElement).closest('video')) return
  lastPointerType = e.pointerType
  // 新一轮触摸的第一根手指：清掉可能残留的旧触点（个别浏览器松手时不发 pointerup）
  if (e.isPrimary) pointers.clear()
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size === 1) {
    gesture = { start: { x: e.clientX, y: e.clientY }, tx: tx.value, ty: ty.value, moved: false, pinched: false }
  } else if (pointers.size === 2 && gesture && !isVideo.value) {
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

  // 未放大时左右滑动切换
  if (scale.value === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    go(dx < 0 ? 1 : -1)
    return
  }
  if (g.moved) return

  // 触屏：自己判断双击
  if (e.pointerType !== 'mouse') {
    const now = performance.now()
    if (
      !isVideo.value &&
      lastTap &&
      now - lastTap.t < 320 &&
      Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30
    ) {
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

// 视频切换后从头自动播放
const videoEl = ref<HTMLVideoElement>()
watch(
  () => view.value.full,
  async () => {
    if (!isVideo.value) return
    await nextTick()
    videoEl.value?.play().catch(() => {})
  },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="lb">
      <div v-if="state" class="lightbox" role="dialog" aria-modal="true" aria-label="查看图片和视频">
        <header class="bar">
          <span class="title ellipsis">{{ state.title }}</span>
          <span v-if="total > 1" class="counter tabular">{{ index + 1 }} / {{ total }}</span>
          <span v-if="scale > 1" class="zoom tabular">{{ Math.round(scale * 100) }}%</span>
          <span v-if="isVideo && view.info?.duration" class="zoom tabular">
            视频 · {{ formatDuration(view.info.duration) }}
          </span>
          <button
            v-if="!isVideo && annotations.length"
            type="button"
            class="btn btn-ghost btn-sm"
            :aria-pressed="showAnnotations"
            :title="showAnnotations ? '隐藏标注，查看原图' : '显示标注'"
            @click="showAnnotations = !showAnnotations"
          >
            <Icon :name="showAnnotations ? 'eye' : 'eyeOff'" :size="15" />
            标注
          </button>
          <button
            v-if="!isVideo"
            type="button"
            class="btn btn-outline btn-sm edit-btn"
            :disabled="!canEdit"
            title="在图片上圈画、放置圆圈、箭头或文本框"
            @click="startEdit"
          >
            <Icon name="edit" :size="14" />
            编辑
          </button>
          <button type="button" class="btn btn-ghost btn-icon" aria-label="关闭" @click="ui.closeLightbox()">
            <Icon name="x" :size="22" />
          </button>
        </header>

        <div
          ref="stage"
          class="stage"
          :class="{ zoomed: scale > 1, 'is-video': isVideo }"
          @wheel="onWheel"
          @dblclick="onDblClick"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <template v-if="isVideo">
            <div
              ref="frameEl"
              class="frame"
              :class="{ sizing: !display }"
              :style="display ? { width: `${display.w}px`, height: `${display.h}px` } : undefined"
            >
              <video
                v-if="view.full"
                :key="view.full"
                ref="videoEl"
                class="player"
                :src="view.full"
                :poster="view.poster ?? undefined"
                controls
                autoplay
                playsinline
                @error="videoError = true"
              />
              <img v-else-if="view.poster" :src="view.poster" alt="" draggable="false" />
              <p v-if="videoError" class="video-error">
                无法播放这个视频：浏览器可能不支持它的编码格式，可以转成 MP4（H.264）后重新上传
              </p>
            </div>
          </template>
          <div
            v-else-if="view.full || view.poster"
            ref="frameEl"
            class="frame"
            :class="{ animating, sizing: !display }"
            :style="{
              width: display ? `${display.w}px` : undefined,
              height: display ? `${display.h}px` : undefined,
              transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            }"
          >
            <img :src="(view.full ?? view.poster)!" alt="" draggable="false" @load="onImageLoad" />
            <AnnotationLayer
              v-if="showAnnotations && annotations.length && mediaSize"
              :annotations="annotations"
              :width="mediaSize.w"
              :height="mediaSize.h"
            />
          </div>
        </div>

        <button v-if="total > 1" type="button" class="nav prev" aria-label="上一个" @click="go(-1)">
          <Icon name="chevronLeft" :size="28" />
        </button>
        <button v-if="total > 1" type="button" class="nav next" aria-label="下一个" @click="go(1)">
          <Icon name="chevronRight" :size="28" />
        </button>

        <footer v-if="total > 1" class="strip">
          <button
            v-for="(t, i) in strip"
            :key="i"
            type="button"
            class="strip-item"
            :class="{ active: i === index }"
            :aria-label="`第 ${i + 1} 个${t.video ? '视频' : '图片'}`"
            @click="index = i"
          >
            <img v-if="t.thumb" :src="t.thumb" alt="" draggable="false" />
            <span v-if="t.video" class="strip-play"><Icon name="play" :size="12" :stroke="0" /></span>
          </button>
        </footer>
        <p v-if="isVideo" class="hint">
          <span class="kbd">←</span> <span class="kbd">→</span> 切换 · <span class="kbd">Esc</span> 关闭
        </p>
        <template v-else>
          <p class="hint desktop">
            滚轮缩放 · 双击放大 · <span class="kbd">←</span> <span class="kbd">→</span> 切换 · 点「编辑」添加标注 ·
            <span class="kbd">Esc</span> 关闭
          </p>
          <p class="hint touch">双指缩放 · 双击放大 / 还原 · 放大后单指拖动 · 左右滑动切换</p>
        </template>

        <ImageAnnotator
          v-if="editTarget"
          :src="editTarget.src"
          :width="editTarget.width"
          :height="editTarget.height"
          :annotations="editTarget.annotations"
          :title="state.title"
          :save="saveAnnotations"
          @close="editTarget = null"
        />
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
.edit-btn {
  border-color: var(--cyan-dim);
  color: var(--cyan);
}
.stage {
  position: relative;
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
  overflow: hidden;
  /* 图片按这个区域（去掉内边距）等比缩小，上下左右都留一点空隙，不会超出窗口 */
  padding: 12px 64px;
  cursor: zoom-in;
  touch-action: none;
}
.stage.zoomed {
  cursor: grab;
}
.stage.is-video {
  cursor: default;
}
.frame {
  position: relative;
  flex: none;
  max-width: 100%;
  max-height: 100%;
  border-radius: var(--r-sm);
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.5);
  transform-origin: center;
  user-select: none;
}
.frame.animating {
  transition: transform 0.2s var(--ease);
}
/* 还不知道图片尺寸时先不显示，避免按原始大小闪一下 */
.frame.sizing {
  visibility: hidden;
}
.frame > img,
.player {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: contain;
  pointer-events: none;
}
.player {
  background: #000;
  pointer-events: auto;
}
.video-error {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(90%, 420px);
  padding: 12px 14px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r);
  background: rgb(10 15 19 / 0.92);
  color: var(--text-2);
  font-size: 13px;
  text-align: center;
  transform: translate(-50%, -50%);
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
  position: relative;
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
.strip-play {
  position: absolute;
  left: 50%;
  top: 50%;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgb(5 8 11 / 0.7);
  color: #fff;
  transform: translate(-50%, -50%);
}
.strip-play :deep(svg) {
  fill: currentColor;
  margin-left: 2px;
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
    padding: 8px;
  }
  .nav {
    display: none;
  }
}
</style>
