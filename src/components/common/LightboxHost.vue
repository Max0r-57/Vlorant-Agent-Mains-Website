<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLayer } from '@/composables/useLayer'
import { getImageUrl, peekImageUrl } from '@/lib/imageCache'
import { useUi } from '@/stores/ui'
import type { ImageSource } from '@/types'
import Icon from './Icon.vue'

/** 图片查看器：左右切换、滚轮缩放、拖动平移、双击放大 */
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
let drag: { x: number; y: number; tx: number; ty: number; moved: boolean; pointerId: number } | null = null
let swipeStart: { x: number; y: number } | null = null

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
  else window.removeEventListener('keydown', onKeydown)
})

// ---- 缩放 / 平移 ----
function zoomAt(clientX: number, clientY: number, next: number) {
  const el = stage.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const cx = clientX - (r.left + r.width / 2)
  const cy = clientY - (r.top + r.height / 2)
  const s = Math.min(6, Math.max(1, next))
  const k = s / scale.value
  tx.value = cx - (cx - tx.value) * k
  ty.value = cy - (cy - ty.value) * k
  scale.value = s
  if (s === 1) resetZoom()
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  zoomAt(e.clientX, e.clientY, scale.value * Math.exp(-e.deltaY * 0.002))
}

function onDblClick(e: MouseEvent) {
  zoomAt(e.clientX, e.clientY, scale.value > 1 ? 1 : 2.5)
}

/** 点击图片以外的空白处关闭查看器 */
function isOnImage(x: number, y: number) {
  const img = stage.value?.querySelector('img')
  if (!img) return false
  const r = img.getBoundingClientRect()
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  drag = { x: e.clientX, y: e.clientY, tx: tx.value, ty: ty.value, moved: false, pointerId: e.pointerId }
  swipeStart = { x: e.clientX, y: e.clientY }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!drag || drag.pointerId !== e.pointerId) return
  const dx = e.clientX - drag.x
  const dy = e.clientY - drag.y
  if (Math.hypot(dx, dy) > 3) drag.moved = true
  if (scale.value > 1) {
    tx.value = drag.tx + dx
    ty.value = drag.ty + dy
  }
}

function onPointerUp(e: PointerEvent) {
  if (!drag) return
  const moved = drag.moved
  drag = null
  // 未放大时左右滑动切换图片
  if (scale.value === 1 && swipeStart) {
    const dx = e.clientX - swipeStart.x
    const dy = e.clientY - swipeStart.y
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1)
    else if (!moved && !isOnImage(e.clientX, e.clientY)) ui.closeLightbox()
  }
  swipeStart = null
}
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
            :src="url"
            alt=""
            draggable="false"
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
        <p class="hint">滚轮缩放 · 双击放大 · <span class="kbd">←</span> <span class="kbd">→</span> 切换 · <span class="kbd">Esc</span> 关闭</p>
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
  will-change: transform;
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
  padding: 0 0 12px;
  color: var(--text-3);
  font-size: 12px;
  text-align: center;
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
  .hint {
    display: none;
  }
}
</style>
