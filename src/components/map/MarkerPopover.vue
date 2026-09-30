<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { computePosition } from '@/lib/floating'
import { formatShort } from '@/lib/format'
import { useLineups } from '@/stores/lineups'
import { useUi } from '@/stores/ui'
import type { Lineup } from '@/types'
import Icon from '@/components/common/Icon.vue'
import TypeBadge from '@/components/common/TypeBadge.vue'
import LineupThumb from '@/components/lineup/LineupThumb.vue'

/**
 * 标记点预览窗口。单个 Lineup 显示一张卡片；
 * 同一位置有多个 Lineup 时显示可以左右滑动（拖动 / 滚轮 / 箭头）的卡片列表。
 */
const props = withDefaults(
  defineProps<{
    lineups: Lineup[]
    /** 标记点中心的屏幕坐标 */
    anchor: { x: number; y: number }
    radius?: number
    focusId?: string | null
    /** 详情页中标出当前 Lineup */
    currentId?: string | null
    showCreate?: boolean
    /** 有路径的 Lineup 显示「现场演练」按钮（首页） */
    showRehearse?: boolean
  }>(),
  { radius: 10, focusId: null, currentId: null, showCreate: true, showRehearse: false },
)
const emit = defineEmits<{
  enter: []
  leave: []
  close: []
  detail: [id: string]
  rehearse: [id: string]
  'create-same': []
  /** 当前显示的卡片（多个 Lineup 时随滑动变化） */
  current: [id: string]
}>()

const store = useLineups()
const ui = useUi()
const root = ref<HTMLElement>()
const track = ref<HTMLElement>()
const pos = ref({ left: -9999, top: -9999, side: 'top' as 'top' | 'bottom' | 'left' | 'right' })
const index = ref(0)

const isStack = computed(() => props.lineups.length > 1)
const CARD_W = 236
const GAP = 10

watch(
  () => props.lineups[index.value]?.id,
  (id) => {
    if (id) emit('current', id)
  },
  { immediate: true },
)

function place() {
  const el = root.value
  if (!el) return
  const r = props.radius
  const anchorRect = { left: props.anchor.x - r, top: props.anchor.y - r, width: r * 2, height: r * 2 }
  const res = computePosition(anchorRect, { width: el.offsetWidth, height: el.offsetHeight }, 'top', {
    offset: 12,
    margin: 10,
  })
  pos.value = { left: res.left, top: res.top, side: res.side }
}

const arrowLeft = computed(() => {
  const w = root.value?.offsetWidth ?? 0
  return Math.min(Math.max(14, props.anchor.x - pos.value.left), w - 14)
})

watch(() => [props.anchor.x, props.anchor.y], place)

let ro: ResizeObserver | null = null
onMounted(async () => {
  await nextTick()
  place()
  ro = new ResizeObserver(place)
  if (root.value) ro.observe(root.value)
  scrollToFocus(false)
})
onBeforeUnmount(() => ro?.disconnect())

watch(
  () => props.focusId,
  () => scrollToFocus(true),
)
watch(
  () => props.lineups.map((l) => l.id).join(),
  async () => {
    await nextTick()
    place()
    scrollToFocus(false)
  },
)

function scrollToFocus(smooth: boolean) {
  const i = props.focusId ? props.lineups.findIndex((l) => l.id === props.focusId) : -1
  scrollToIndex(i >= 0 ? i : 0, smooth)
}

function scrollToIndex(i: number, smooth = true) {
  const t = track.value
  index.value = Math.max(0, Math.min(props.lineups.length - 1, i))
  if (!t) return
  t.scrollTo({ left: index.value * (CARD_W + GAP), behavior: smooth ? 'smooth' : 'auto' })
}

function onScroll() {
  const t = track.value
  if (!t || dragging) return
  index.value = Math.round(t.scrollLeft / (CARD_W + GAP))
}

// 竖向滚轮转为横向滑动
function onWheel(e: WheelEvent) {
  const t = track.value
  if (!t || !isStack.value) return
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    e.preventDefault()
    t.scrollBy({ left: e.deltaY, behavior: 'auto' })
  }
}

// 鼠标按住左右拖动
let dragging = false
let dragStart = { x: 0, scroll: 0, moved: false }
function onTrackPointerDown(e: PointerEvent) {
  if (e.pointerType !== 'mouse' || e.button !== 0 || !isStack.value) return
  dragging = true
  dragStart = { x: e.clientX, scroll: track.value!.scrollLeft, moved: false }
}
function onTrackPointerMove(e: PointerEvent) {
  if (!dragging || !track.value) return
  const dx = e.clientX - dragStart.x
  if (!dragStart.moved && Math.abs(dx) < 5) return
  if (!dragStart.moved) {
    dragStart.moved = true
    track.value.setPointerCapture(e.pointerId)
    track.value.classList.add('grabbing')
  }
  track.value.scrollLeft = dragStart.scroll - dx
}
function onTrackPointerUp() {
  if (!dragging || !track.value) return
  const moved = dragStart.moved
  dragging = false
  track.value.classList.remove('grabbing')
  if (moved) {
    const i = Math.round(track.value.scrollLeft / (CARD_W + GAP))
    scrollToIndex(i)
    // 拖动结束时不要触发卡片上的点击
    const block = (ev: Event) => {
      ev.stopPropagation()
      ev.preventDefault()
    }
    track.value.addEventListener('click', block, { capture: true, once: true })
    setTimeout(() => track.value?.removeEventListener('click', block, { capture: true }), 0)
  }
}

function openImages(l: Lineup) {
  if (!l.imageIds.length) {
    emit('detail', l.id)
    return
  }
  ui.openLightbox(
    l.imageIds.map((id) => ({ kind: 'stored' as const, id })),
    0,
    l.name,
  )
}
</script>

<template>
  <Teleport to="body">
    <div
      ref="root"
      class="popover"
      :class="[`side-${pos.side}`, { stack: isStack }]"
      :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
      role="dialog"
      :aria-label="isStack ? `此位置有 ${lineups.length} 个 Lineup` : lineups[0]?.name"
      @pointerenter="emit('enter')"
      @pointerleave="emit('leave')"
    >
      <header v-if="isStack" class="head">
        <span class="head-title">
          <Icon name="layers" :size="15" />
          此位置 {{ lineups.length }} 个 Lineup
        </span>
        <span class="pager tabular">{{ index + 1 }} / {{ lineups.length }}</span>
        <button
          type="button"
          class="nav"
          aria-label="上一个"
          :disabled="index === 0"
          @click="scrollToIndex(index - 1)"
        >
          <Icon name="chevronLeft" :size="16" />
        </button>
        <button
          type="button"
          class="nav"
          aria-label="下一个"
          :disabled="index === lineups.length - 1"
          @click="scrollToIndex(index + 1)"
        >
          <Icon name="chevronRight" :size="16" />
        </button>
      </header>

      <div
        ref="track"
        class="track"
        @scroll.passive="onScroll"
        @wheel="onWheel"
        @pointerdown="onTrackPointerDown"
        @pointermove="onTrackPointerMove"
        @pointerup="onTrackPointerUp"
        @pointercancel="onTrackPointerUp"
      >
        <article
          v-for="(l, i) in lineups"
          :key="l.id"
          class="card"
          :class="{ focused: isStack && l.id === focusId, current: l.id === currentId, dim: isStack && i !== index }"
          :style="{ width: isStack ? `${CARD_W}px` : undefined }"
        >
          <button
            type="button"
            class="cover"
            :title="l.imageIds.length ? '点击查看大图' : '暂无图片'"
            @click="openImages(l)"
          >
            <LineupThumb :image-id="l.imageIds[0]" :color="store.typeColor(l.typeId)" :alt="l.name" />
            <span v-if="l.imageIds.length > 1" class="img-count">
              <Icon name="image" :size="12" />
              {{ l.imageIds.length }}
            </span>
            <span v-if="l.id === currentId" class="current-tag">当前</span>
          </button>
          <div class="body">
            <h3 class="name" :title="l.name">{{ l.name }}</h3>
            <div class="meta">
              <TypeBadge :type-id="l.typeId" size="sm" />
              <span class="date tabular">{{ formatShort(l.createdAt) }}</span>
            </div>
            <p v-if="l.note" class="note">{{ l.note }}</p>
            <div v-if="l.id !== currentId || (showRehearse && l.paths.length)" class="btn-row">
              <button
                v-if="l.id !== currentId"
                type="button"
                class="btn btn-sm btn-outline detail-btn"
                @click="emit('detail', l.id)"
              >
                详情
                <Icon name="chevronRight" :size="14" />
              </button>
              <button
                v-if="showRehearse && l.paths.length"
                type="button"
                class="btn btn-sm btn-outline rehearse-btn"
                @click="emit('rehearse', l.id)"
              >
                <Icon name="play" :size="12" />
                现场演练
              </button>
            </div>
          </div>
        </article>
      </div>

      <footer v-if="showCreate" class="foot">
        <button type="button" class="btn btn-sm btn-ghost create" @click="emit('create-same')">
          <Icon name="plusCircle" :size="15" />
          相同位置新建
        </button>
      </footer>
      <span class="arrow" :style="{ left: `${arrowLeft}px` }" />
    </div>
  </Teleport>
</template>

<style scoped>
.popover {
  position: fixed;
  z-index: var(--z-popover);
  display: flex;
  flex-direction: column;
  width: 264px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-lg);
  background: var(--bg-elev);
  box-shadow: var(--shadow-pop);
  animation: pop-in 0.14s var(--ease);
}
.popover.stack {
  width: 286px;
}
@keyframes pop-in {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.98);
  }
}
.head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 8px 0 12px;
}
.head-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 700;
}
.pager {
  margin-right: 4px;
  color: var(--text-3);
  font-size: 12px;
}
.nav {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--text);
}
.nav:hover:not(:disabled) {
  background: var(--surface-3);
}
.nav:disabled {
  opacity: 0.35;
  cursor: default;
}

.track {
  display: flex;
  gap: 10px;
  padding: 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
}
.track::-webkit-scrollbar {
  display: none;
}
.stack .track {
  padding-right: 30px;
  cursor: grab;
}
.track.grabbing {
  scroll-snap-type: none;
  cursor: grabbing;
}
.card {
  flex: none;
  width: 100%;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--surface);
  scroll-snap-align: start;
  transition:
    opacity 0.2s var(--ease),
    border-color 0.2s var(--ease);
}
.card.dim {
  opacity: 0.55;
}
.card.focused {
  border-color: var(--cyan-dim);
}
.card.current {
  border-color: var(--gold);
}
.cover {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  padding: 0;
  border: 0;
  background: none;
  cursor: zoom-in;
}
.cover .thumb {
  width: 100%;
  height: 100%;
}
.img-count {
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: var(--r-xs);
  background: rgb(5 8 11 / 0.75);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}
.current-tag {
  position: absolute;
  left: 6px;
  top: 6px;
  padding: 1px 6px;
  border-radius: var(--r-xs);
  background: var(--gold);
  color: #1b1400;
  font-size: 11px;
  font-weight: 800;
}
.body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 10px 10px;
}
.name {
  overflow: hidden;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.date {
  flex: none;
  color: var(--text-3);
  font-size: 12px;
}
.note {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.5;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: pre-line;
}
.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.detail-btn {
  gap: 2px;
  padding-right: 6px;
}
.rehearse-btn {
  gap: 5px;
  border-color: rgb(120 251 231 / 0.4);
  color: var(--cyan);
}
.rehearse-btn:hover:not(:disabled) {
  background: var(--cyan-soft);
}
.foot {
  display: flex;
  padding: 0 10px 10px;
}
.stack .foot {
  padding-top: 0;
}
.create {
  width: 100%;
  color: var(--cyan);
  border: 1px dashed rgb(120 251 231 / 0.35);
}
.create:hover:not(:disabled) {
  background: var(--cyan-soft);
  color: var(--cyan);
}
.arrow {
  position: absolute;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  border: 1px solid var(--line-strong);
  background: var(--bg-elev);
  transform: rotate(45deg);
  pointer-events: none;
}
.side-top .arrow {
  bottom: -7px;
  border-top: 0;
  border-left: 0;
}
.side-bottom .arrow {
  top: -7px;
  border-bottom: 0;
  border-right: 0;
}
</style>
