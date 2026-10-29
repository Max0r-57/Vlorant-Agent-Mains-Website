<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { computePosition } from '@/lib/floating'
import { formatShort } from '@/lib/format'
import { hasPaths } from '@/lib/paths'
import { useLineups } from '@/stores/lineups'
import { useUi } from '@/stores/ui'
import type { Lineup } from '@/types'
import Icon from '@/components/common/Icon.vue'
import TypeBadge from '@/components/common/TypeBadge.vue'
import LineupThumb from '@/components/lineup/LineupThumb.vue'

/**
 * 标记点预览窗口。单个 Lineup 显示一张卡片；
 * 同一位置有多个 Lineup 时显示可以自由左右滑动（拖动 / 滚轮 / 下方滑动条）的卡片栏。
 * selectable 时点击卡片选中 / 取消选中（首页）。
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
    /** 点击卡片选中 / 取消选中 */
    selectable?: boolean
    selectedIds?: readonly string[]
    /** 查看图片时可以连续切换的 Lineup 列表（默认为这个位置的 Lineup） */
    sequence?: readonly Lineup[]
  }>(),
  {
    radius: 10,
    focusId: null,
    currentId: null,
    showCreate: true,
    showRehearse: false,
    selectable: false,
    selectedIds: () => [],
  },
)
const emit = defineEmits<{
  enter: []
  leave: []
  close: []
  detail: [id: string]
  rehearse: [id: string]
  'create-same': []
  /** 当前预览的卡片（鼠标移到哪张卡片上就是哪张），地图上显示它的落点和路径 */
  current: [id: string]
  /** 点击卡片：选中 / 取消选中 */
  select: [id: string]
}>()

const store = useLineups()
const ui = useUi()
const root = ref<HTMLElement>()
const track = ref<HTMLElement>()
const pos = ref({ left: -9999, top: -9999, side: 'top' as 'top' | 'bottom' | 'left' | 'right' })

const isStack = computed(() => props.lineups.length > 1)
const selected = computed(() => new Set(props.selectedIds))
const CARD_W = 188
const GAP = 8

function initialCurrent() {
  const l = props.lineups.find((x) => x.id === props.focusId) ?? props.lineups[0]
  if (l) emit('current', l.id)
}

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
  initialCurrent()
  await nextTick()
  place()
  ro = new ResizeObserver(place)
  if (root.value) ro.observe(root.value)
  scrollToFocus(false)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  cancelAnimationFrame(glide)
})

watch(
  () => props.focusId,
  () => {
    initialCurrent()
    scrollToFocus(true)
  },
)
watch(
  () => props.lineups.map((l) => l.id).join(),
  async () => {
    initialCurrent()
    await nextTick()
    place()
    scrollToFocus(false)
  },
)

/** 把聚焦的卡片滚到可见范围的中间 */
function scrollToFocus(smooth: boolean) {
  const t = track.value
  const i = props.focusId ? props.lineups.findIndex((l) => l.id === props.focusId) : -1
  if (!t || i < 0) return
  const left = i * (CARD_W + GAP) - (t.clientWidth - CARD_W) / 2
  t.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' })
}

// 竖向滚轮转为横向滑动
function onWheel(e: WheelEvent) {
  const t = track.value
  if (!t || !isStack.value) return
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    e.preventDefault()
    cancelAnimationFrame(glide)
    t.scrollBy({ left: e.deltaY, behavior: 'smooth' })
  }
}

// 鼠标按住左右拖动，松开后带一点惯性继续滑动
let dragging = false
let dragStart = { x: 0, scroll: 0, moved: false }
let velocity = 0
let lastMove = { x: 0, t: 0 }
let glide = 0
function onTrackPointerDown(e: PointerEvent) {
  if (e.pointerType !== 'mouse' || e.button !== 0 || !isStack.value) return
  // 拖动下方的滑动条时交给浏览器
  const t = track.value!
  if (e.clientY > t.getBoundingClientRect().top + t.clientHeight) return
  cancelAnimationFrame(glide)
  dragging = true
  dragStart = { x: e.clientX, scroll: t.scrollLeft, moved: false }
  velocity = 0
  lastMove = { x: e.clientX, t: performance.now() }
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
  const now = performance.now()
  const dt = Math.max(1, now - lastMove.t)
  velocity = 0.8 * ((lastMove.x - e.clientX) / dt) + 0.2 * velocity
  lastMove = { x: e.clientX, t: now }
  track.value.scrollLeft = dragStart.scroll - dx
}
function onTrackPointerUp() {
  if (!dragging || !track.value) return
  const t = track.value
  const moved = dragStart.moved
  dragging = false
  t.classList.remove('grabbing')
  if (!moved) return
  // 惯性：速度（像素 / 毫秒）逐帧衰减
  let v = performance.now() - lastMove.t > 80 ? 0 : velocity
  let prev = performance.now()
  const step = (now: number) => {
    const dt = now - prev
    prev = now
    v *= Math.pow(0.94, dt / 16)
    if (Math.abs(v) < 0.02) return
    t.scrollLeft += v * dt
    glide = requestAnimationFrame(step)
  }
  glide = requestAnimationFrame(step)
  // 拖动结束时不要触发卡片上的点击
  const block = (ev: Event) => {
    ev.stopPropagation()
    ev.preventDefault()
  }
  t.addEventListener('click', block, { capture: true, once: true })
  setTimeout(() => t.removeEventListener('click', block, { capture: true }), 0)
}

function onCardClick(l: Lineup, e: MouseEvent) {
  emit('current', l.id)
  if (!props.selectable || (e.target as HTMLElement).closest('button')) return
  emit('select', l.id)
}

function openImages(l: Lineup) {
  if (!l.imageIds.length) {
    emit('detail', l.id)
    return
  }
  ui.openLineupImages(props.sequence ?? props.lineups, l.id)
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
      </header>

      <div
        ref="track"
        class="track"
        @wheel="onWheel"
        @pointerdown="onTrackPointerDown"
        @pointermove="onTrackPointerMove"
        @pointerup="onTrackPointerUp"
        @pointercancel="onTrackPointerUp"
      >
        <article
          v-for="l in lineups"
          :key="l.id"
          class="card"
          :class="{
            focused: isStack && l.id === focusId && !selectable,
            current: l.id === currentId,
            selectable,
            selected: selected.has(l.id),
          }"
          :style="{ width: isStack ? `${CARD_W}px` : undefined }"
          :aria-selected="selectable ? selected.has(l.id) : undefined"
          @pointerenter="emit('current', l.id)"
          @click="onCardClick(l, $event)"
        >
          <button
            type="button"
            class="cover"
            :title="l.imageIds.length ? '点击查看图片 / 视频' : '暂无图片'"
            @click="openImages(l)"
          >
            <LineupThumb :image-id="l.imageIds[0]" :color="store.typeColor(l.typeId)" :alt="l.name" />
            <span v-if="l.imageIds.length > 1" class="img-count">
              <Icon name="image" :size="12" />
              {{ l.imageIds.length }}
            </span>
            <span v-if="l.id === currentId" class="current-tag">当前</span>
            <span v-if="selected.has(l.id)" class="selected-tag"><Icon name="check" :size="12" :stroke="3" /></span>
          </button>
          <div class="body">
            <h3 class="name" :title="l.name">{{ l.name }}</h3>
            <div class="meta">
              <TypeBadge :type-id="l.typeId" size="sm" />
              <span class="date tabular">{{ formatShort(l.createdAt) }}</span>
            </div>
            <p v-if="l.note" class="note">{{ l.note }}</p>
            <div v-if="l.id !== currentId || (showRehearse && hasPaths(l))" class="btn-row">
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
                v-if="showRehearse && hasPaths(l)"
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
  width: 336px;
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
.track {
  display: flex;
  gap: 8px;
  padding: 10px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
}
.stack .track {
  padding-bottom: 8px;
  cursor: grab;
  scrollbar-color: var(--line-strong) transparent;
  scrollbar-width: thin;
}
.stack .track::-webkit-scrollbar {
  height: 8px;
}
.stack .track::-webkit-scrollbar-thumb {
  border: 2px solid var(--bg-elev);
  border-radius: 999px;
  background: var(--line-strong);
}
.stack .track::-webkit-scrollbar-thumb:hover {
  background: var(--text-3);
}
.track.grabbing {
  cursor: grabbing;
  user-select: none;
}
.card {
  flex: none;
  width: 100%;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--surface);
  transition:
    border-color 0.15s var(--ease),
    box-shadow 0.15s var(--ease);
}
.card.selectable {
  cursor: pointer;
}
.card.selectable:hover {
  border-color: var(--line-strong);
}
.card.selected,
.card.selected:hover {
  border-color: var(--cyan);
  box-shadow: inset 0 0 0 1px var(--cyan);
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
.selected-tag {
  position: absolute;
  right: 6px;
  top: 6px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--cyan);
  color: #031614;
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
