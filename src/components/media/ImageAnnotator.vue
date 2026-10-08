<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useLayer } from '@/composables/useLayer'
import {
  ANNOTATION_COLORS,
  annotationBounds,
  hitTest,
  layoutText,
  levelOf,
  newAnnotationId,
  plainAnnotations,
  SIZE_LEVELS,
  strokeSize,
  textBackground,
  textSize,
  translateAnnotation,
  TEXT_FONT_FAMILY,
  type SizeLevel,
} from '@/lib/annotations'
import { simplifyPath } from '@/lib/geometry'
import { useUi } from '@/stores/ui'
import type { Annotation, Position, TextAnnotation } from '@/types'
import Icon from '@/components/common/Icon.vue'
import type { IconName } from '@/components/common/icons'
import AnnotationLayer from './AnnotationLayer.vue'

/**
 * 图片标注编辑器（在图片查看器里打开）：画笔、圆圈、箭头、文本框，可以选中后移动 / 删除，支持撤销重做。
 * 保存时把标注交给 save（由查看器写入数据库或草稿），原图不会被修改。
 */
const props = defineProps<{
  src: string
  /** 原图尺寸：标注坐标以它为准 */
  width: number
  height: number
  annotations: readonly Annotation[]
  title?: string
  save: (annotations: Annotation[]) => Promise<void>
}>()
const emit = defineEmits<{ close: [] }>()
const ui = useUi()

type Tool = 'select' | 'pen' | 'ellipse' | 'arrow' | 'text'
const TOOLS: { id: Tool; label: string; icon: IconName; key: string; hint: string }[] = [
  { id: 'select', label: '选择', icon: 'pointer', key: 'V', hint: '点选标注后拖动可以移动，Delete 删除，双击文字可以修改' },
  { id: 'pen', label: '画笔', icon: 'pen', key: 'P', hint: '按住左键拖动，随手圈画' },
  { id: 'ellipse', label: '圆圈', icon: 'circle', key: 'O', hint: '拖动画出圆圈（按住 Shift 为正圆）；单击直接放置一个圆圈' },
  { id: 'arrow', label: '箭头', icon: 'arrowUpRight', key: 'A', hint: '从箭尾拖到箭头指向的位置；单击放置一个指向该处的箭头' },
  { id: 'text', label: '文字', icon: 'type', key: 'T', hint: '单击放置文本框，Enter 完成，Shift + Enter 换行' },
]

const tool = ref<Tool>('pen')
const color = ref<string>(ANNOTATION_COLORS[0])
const level = ref<SizeLevel>(2)
const toolHint = computed(() => TOOLS.find((t) => t.id === tool.value)!.hint)

// ---------- 标注列表与撤销 / 重做 ----------
const items = shallowRef<Annotation[]>(plainAnnotations(props.annotations))
const history = shallowRef<Annotation[][]>([items.value])
const cursor = ref(0)
const initialJson = JSON.stringify(items.value)
const dirty = computed(() => JSON.stringify(items.value) !== initialJson)
const canUndo = computed(() => cursor.value > 0)
const canRedo = computed(() => cursor.value < history.value.length - 1)

function commit(next: Annotation[]) {
  history.value = [...history.value.slice(0, cursor.value + 1), next]
  cursor.value = history.value.length - 1
  items.value = next
}

function undo() {
  if (!canUndo.value) return
  cursor.value--
  items.value = history.value[cursor.value]!
  keepSelection()
}

function redo() {
  if (!canRedo.value) return
  cursor.value++
  items.value = history.value[cursor.value]!
  keepSelection()
}

function clearAll() {
  if (!items.value.length) return
  commit([])
  selectedId.value = null
}

// ---------- 选中 ----------
const selectedId = ref<string | null>(null)
const selected = computed(() => items.value.find((a) => a.id === selectedId.value) ?? null)

function keepSelection() {
  if (selectedId.value && !items.value.some((a) => a.id === selectedId.value)) selectedId.value = null
}

function replaceItem(a: Annotation) {
  commit(items.value.map((x) => (x.id === a.id ? a : x)))
}

function removeSelected() {
  if (!selectedId.value) return
  commit(items.value.filter((a) => a.id !== selectedId.value))
  selectedId.value = null
}

/** 选中标注时，工具栏的颜色 / 粗细跟着变；改颜色 / 粗细也会作用到选中的标注 */
watch(selected, (a) => {
  if (!a) return
  color.value = a.color
  level.value = levelOf(a, props.width, props.height)
})

function pickColor(c: string) {
  color.value = c
  const a = selected.value
  if (a && a.color !== c) replaceItem({ ...a, color: c })
}

function pickLevel(l: SizeLevel) {
  level.value = l
  const a = selected.value
  if (!a) return
  const size = a.type === 'text' ? textSize(l, props.width, props.height) : strokeSize(l, props.width, props.height)
  if (a.size !== size) replaceItem({ ...a, size })
}

function setTool(t: Tool) {
  commitText()
  tool.value = t
  if (t !== 'select') selectedId.value = null
}

// ---------- 画布尺寸与坐标换算 ----------
const area = ref<HTMLElement>()
const frame = ref<HTMLElement>()
const display = ref({ w: 0, h: 0 })
/** 屏幕像素 / 原图像素 */
const scale = computed(() => (props.width ? display.value.w / props.width : 1))

function layout() {
  const el = area.value
  if (!el || !props.width || !props.height) return
  const pad = 24
  const k = Math.min((el.clientWidth - pad * 2) / props.width, (el.clientHeight - pad * 2) / props.height)
  const s = Math.max(0.01, k)
  display.value = { w: Math.round(props.width * s), h: Math.round(props.height * s) }
}

let ro: ResizeObserver | undefined
onMounted(() => {
  layout()
  ro = new ResizeObserver(layout)
  if (area.value) ro.observe(area.value)
  window.addEventListener('keydown', onKeydown, true)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  window.removeEventListener('keydown', onKeydown, true)
})

function toImage(e: { clientX: number; clientY: number }): Position {
  const r = frame.value!.getBoundingClientRect()
  return {
    x: ((e.clientX - r.left) / r.width) * props.width,
    y: ((e.clientY - r.top) / r.height) * props.height,
  }
}

function clampToImage(p: Position): Position {
  return { x: Math.min(props.width, Math.max(0, p.x)), y: Math.min(props.height, Math.max(0, p.y)) }
}

const r1 = (n: number) => Math.round(n * 10) / 10

// ---------- 绘制 ----------
const draft = shallowRef<Annotation | null>(null)
type Drag =
  | { kind: 'pen'; pointerId: number }
  | { kind: 'ellipse' | 'arrow'; pointerId: number; start: Position }
  | { kind: 'move'; pointerId: number; start: Position; orig: Annotation; moved: boolean }
let drag: Drag | null = null

const shown = computed(() => {
  const list = draft.value ? [...items.value, draft.value] : items.value
  return movePreview.value ? list.map((a) => (a.id === movePreview.value!.id ? movePreview.value! : a)) : list
})
const movePreview = shallowRef<Annotation | null>(null)

function onPointerDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  if (textEdit.value) {
    commitText()
    return
  }
  const p = toImage(e)
  const tol = 6 / scale.value
  if (tool.value === 'text') {
    e.preventDefault()
    const hit = hitTest(items.value, p, tol)
    openText(hit?.type === 'text' ? hit : null, clampToImage(p))
    return
  }
  frame.value!.setPointerCapture(e.pointerId)
  const q = clampToImage(p)
  switch (tool.value) {
    case 'select': {
      const hit = hitTest(items.value, p, tol)
      selectedId.value = hit?.id ?? null
      if (hit) drag = { kind: 'move', pointerId: e.pointerId, start: p, orig: hit, moved: false }
      break
    }
    case 'pen':
      draft.value = {
        id: newAnnotationId(),
        type: 'pen',
        color: color.value,
        size: strokeSize(level.value, props.width, props.height),
        points: [r1(q.x), r1(q.y)],
      }
      drag = { kind: 'pen', pointerId: e.pointerId }
      break
    case 'ellipse':
    case 'arrow':
      drag = { kind: tool.value, pointerId: e.pointerId, start: q }
      break
  }
}

function onPointerMove(e: PointerEvent) {
  const d = drag
  if (!d) {
    hoverCursor(e)
    return
  }
  if (e.pointerId !== d.pointerId) return
  const p = clampToImage(toImage(e))
  const minGap = 2 / scale.value
  switch (d.kind) {
    case 'pen': {
      const a = draft.value
      if (a?.type !== 'pen') return
      const n = a.points.length
      if (Math.hypot(p.x - a.points[n - 2]!, p.y - a.points[n - 1]!) < minGap) return
      // 每次换成新数组，拖动途中就能看到画出的线
      draft.value = { ...a, points: [...a.points, r1(p.x), r1(p.y)] }
      break
    }
    case 'ellipse': {
      let w = p.x - d.start.x
      let h = p.y - d.start.y
      if (e.shiftKey) {
        const m = Math.max(Math.abs(w), Math.abs(h))
        w = Math.sign(w || 1) * m
        h = Math.sign(h || 1) * m
      }
      if (Math.abs(w) < minGap * 2 && Math.abs(h) < minGap * 2) return
      draft.value = {
        id: draft.value?.id ?? newAnnotationId(),
        type: 'ellipse',
        color: color.value,
        size: strokeSize(level.value, props.width, props.height),
        x: r1(Math.min(d.start.x, d.start.x + w)),
        y: r1(Math.min(d.start.y, d.start.y + h)),
        w: r1(Math.max(Math.abs(w), 1)),
        h: r1(Math.max(Math.abs(h), 1)),
      }
      break
    }
    case 'arrow':
      if (Math.hypot(p.x - d.start.x, p.y - d.start.y) < minGap * 3) return
      draft.value = {
        id: draft.value?.id ?? newAnnotationId(),
        type: 'arrow',
        color: color.value,
        size: strokeSize(level.value, props.width, props.height),
        x1: r1(d.start.x),
        y1: r1(d.start.y),
        x2: r1(p.x),
        y2: r1(p.y),
      }
      break
    case 'move': {
      const raw = toImage(e)
      const dx = raw.x - d.start.x
      const dy = raw.y - d.start.y
      if (!d.moved && Math.hypot(dx, dy) * scale.value < 3) return
      d.moved = true
      movePreview.value = translateAnnotation(d.orig, ...clampMove(d.orig, dx, dy))
      break
    }
  }
}

/** 移动时至少留一部分在图片里，避免拖到外面找不回来 */
function clampMove(a: Annotation, dx: number, dy: number): [number, number] {
  const b = annotationBounds(a)
  const keep = Math.min(24 / scale.value, b.w / 2, b.h / 2)
  const x = Math.min(props.width - keep - b.x, Math.max(keep - b.x - b.w, dx))
  const y = Math.min(props.height - keep - b.y, Math.max(keep - b.y - b.h, dy))
  return [x, y]
}

function onPointerUp(e: PointerEvent) {
  const d = drag
  if (!d || e.pointerId !== d.pointerId) return
  drag = null
  const a = draft.value
  draft.value = null
  if (e.type === 'pointercancel') {
    movePreview.value = null
    return
  }
  const p = clampToImage(toImage(e))
  const size = strokeSize(level.value, props.width, props.height)
  switch (d.kind) {
    case 'pen':
      if (a?.type === 'pen' && a.points.length >= 4) {
        // 去掉多余的点（偏差小于半个屏幕像素），线条不变但数据更小
        const simplified = simplifyPath(
          Array.from({ length: a.points.length / 2 }, (_, i) => ({ x: a.points[i * 2]!, y: a.points[i * 2 + 1]! })),
          0.5 / scale.value,
        )
        commit([...items.value, { ...a, points: simplified.flatMap((q) => [q.x, q.y]) }])
      }
      break
    case 'ellipse':
      if (a) commit([...items.value, a])
      else {
        // 单击：以该处为圆心放置一个圆圈
        const r = r1(Math.min(props.width, props.height) * 0.06)
        commit([
          ...items.value,
          { id: newAnnotationId(), type: 'ellipse', color: color.value, size, x: r1(p.x - r), y: r1(p.y - r), w: r * 2, h: r * 2 },
        ])
      }
      break
    case 'arrow':
      if (a) commit([...items.value, a])
      else {
        // 单击：放置一个从左上方指向该处的箭头（靠近边缘时换个方向）
        const len = Math.min(props.width, props.height) * 0.16
        const sx = p.x - len * 0.7 < 0 ? 1 : -1
        const sy = p.y - len * 0.7 < 0 ? 1 : -1
        commit([
          ...items.value,
          {
            id: newAnnotationId(),
            type: 'arrow',
            color: color.value,
            size,
            x1: r1(p.x + sx * len * 0.7),
            y1: r1(p.y + sy * len * 0.7),
            x2: r1(p.x),
            y2: r1(p.y),
          },
        ])
      }
      break
    case 'move':
      if (d.moved && movePreview.value) replaceItem(movePreview.value)
      movePreview.value = null
      break
  }
}

function onDblClick(e: MouseEvent) {
  if (tool.value !== 'select') return
  const hit = hitTest(items.value, toImage(e), 6 / scale.value)
  if (hit?.type === 'text') openText(hit, { x: hit.x, y: hit.y })
}

const cursorStyle = ref('')
function hoverCursor(e: PointerEvent) {
  if (tool.value !== 'select') {
    cursorStyle.value = ''
    return
  }
  cursorStyle.value = hitTest(items.value, toImage(e), 6 / scale.value) ? 'move' : 'default'
}

// ---------- 文本框 ----------
const textEdit = ref<{ id: string | null; x: number; y: number; text: string; color: string; size: number } | null>(
  null,
)
const textArea = ref<HTMLTextAreaElement>()

function openText(existing: TextAnnotation | null, at: Position) {
  if (existing) {
    selectedId.value = existing.id
    textEdit.value = { id: existing.id, x: existing.x, y: existing.y, text: existing.text, color: existing.color, size: existing.size }
  } else {
    const size = textSize(level.value, props.width, props.height)
    // 点击处作为文字第一行的中间偏左，文本框不要超出图片
    const x = Math.min(at.x, props.width - size * 3)
    const y = Math.min(Math.max(0, at.y - size * 0.85), props.height - size * 1.7)
    textEdit.value = { id: null, x: r1(Math.max(0, x)), y: r1(y), text: '', color: color.value, size }
  }
  void nextTick(() => {
    textArea.value?.focus()
    textArea.value?.select()
  })
}

/** 编辑中的文本框在屏幕上的位置和大小（和最终的文本框一致） */
const textBox = computed(() => {
  const t = textEdit.value
  if (!t) return null
  const k = scale.value
  const lay = layoutText({ text: t.text || ' ', size: t.size })
  return {
    left: `${t.x * k}px`,
    top: `${t.y * k}px`,
    width: `${Math.max(lay.width, t.size * 4) * k + 2}px`,
    height: `${lay.height * k}px`,
    padding: `${lay.padY * k}px ${lay.padX * k}px`,
    fontSize: `${t.size * k}px`,
    lineHeight: `${lay.lineHeight * k}px`,
    borderRadius: `${lay.radius * k}px`,
    color: t.color,
    background: textBackground(t.color),
    fontFamily: TEXT_FONT_FAMILY,
  }
})

function commitText() {
  const t = textEdit.value
  if (!t) return
  textEdit.value = null
  const text = t.text.replace(/\s+$/, '')
  if (t.id) {
    const old = items.value.find((a) => a.id === t.id)
    if (!old || old.type !== 'text') return
    if (!text.trim()) {
      commit(items.value.filter((a) => a.id !== t.id))
      selectedId.value = null
    } else if (text !== old.text) replaceItem({ ...old, text })
  } else if (text.trim()) {
    commit([...items.value, { id: newAnnotationId(), type: 'text', color: t.color, size: t.size, x: t.x, y: t.y, text }])
  }
}

function cancelText() {
  textEdit.value = null
}

function onTextKeydown(e: KeyboardEvent) {
  if (e.isComposing) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    commitText()
  }
}

// ---------- 快捷键 ----------
// 在捕获阶段处理并阻止继续传递：例如详情页的 Ctrl+S（保存 Lineup）不会同时触发
function onKeydown(e: KeyboardEvent) {
  if (e.isComposing || ui.confirmState) return
  const mod = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()
  const done = () => {
    e.preventDefault()
    e.stopPropagation()
  }
  if (mod && key === 's') {
    done()
    void doSave()
    return
  }
  if (textEdit.value) return
  const target = e.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable]')) return
  if (mod && key === 'z') {
    done()
    if (e.shiftKey) redo()
    else undo()
  } else if (mod && key === 'y') {
    done()
    redo()
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId.value) {
    done()
    removeSelected()
  } else if (!mod && !e.altKey) {
    const t = TOOLS.find((x) => x.key.toLowerCase() === key)
    if (t) {
      done()
      setTool(t.id)
    }
  }
}

// ---------- 保存 / 退出 ----------
const saving = ref(false)

async function doSave() {
  commitText()
  if (saving.value) return
  saving.value = true
  try {
    await props.save(plainAnnotations(items.value))
    emit('close')
  } catch (e) {
    ui.toast(e instanceof Error ? `保存失败：${e.message}` : '保存失败', { kind: 'error' })
  } finally {
    saving.value = false
  }
}

async function requestExit() {
  if (textEdit.value) {
    cancelText()
    return
  }
  if (!dirty.value) {
    emit('close')
    return
  }
  const r = await ui.choose({
    title: '保存标注？',
    message: '标注有修改还没有保存。',
    confirmText: '保存',
    altText: '不保存',
    cancelText: '继续编辑',
  })
  if (r === 'confirm') await doSave()
  else if (r === 'alt') emit('close')
}

// Esc：正在输入文字时取消输入，否则退出编辑（有修改会先询问）
useLayer(() => true, () => void requestExit())

const selectionBox = computed(() => {
  const a = selected.value
  if (!a || textEdit.value?.id === a.id) return null
  const shownA = movePreview.value?.id === a.id ? movePreview.value : a
  const b = annotationBounds(shownA)
  const pad = 5 / scale.value
  return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }
})
</script>

<template>
  <div class="annotator" role="dialog" aria-modal="true" aria-label="编辑图片标注">
    <header class="top">
      <div class="heading">
        <span class="eyebrow">编辑标注</span>
        <span v-if="title" class="name ellipsis">{{ title }}</span>
      </div>
      <span v-if="dirty" class="unsaved">有未保存的修改</span>
      <button type="button" class="btn btn-outline" :disabled="saving" @click="requestExit">
        <Icon name="x" :size="15" />
        退出
      </button>
      <button type="button" class="btn btn-primary save" :disabled="saving" @click="doSave">
        <Icon name="check" :size="15" />
        {{ saving ? '保存中…' : '保存' }}
      </button>
    </header>

    <div class="toolbar" role="toolbar" aria-label="标注工具">
      <div class="group tools">
        <button
          v-for="t in TOOLS"
          :key="t.id"
          type="button"
          class="tool"
          :class="{ active: tool === t.id }"
          :aria-pressed="tool === t.id"
          :title="`${t.label}（${t.key}）`"
          @click="setTool(t.id)"
        >
          <Icon :name="t.icon" :size="17" />
          <span class="tool-label">{{ t.label }}</span>
        </button>
      </div>
      <span class="sep" />
      <div class="group colors" aria-label="颜色">
        <button
          v-for="c in ANNOTATION_COLORS"
          :key="c"
          type="button"
          class="swatch"
          :class="{ active: color === c }"
          :style="{ '--sw': c }"
          :aria-label="`颜色 ${c}`"
          :aria-pressed="color === c"
          @click="pickColor(c)"
        />
      </div>
      <span class="sep" />
      <div class="segmented sizes" aria-label="粗细">
        <button
          v-for="s in SIZE_LEVELS"
          :key="s.level"
          type="button"
          :aria-pressed="level === s.level"
          :title="tool === 'text' || selected?.type === 'text' ? `字号：${s.label}` : `粗细：${s.label}`"
          @click="pickLevel(s.level)"
        >
          <i class="dot" :style="{ width: `${s.level * 3 + 2}px`, height: `${s.level * 3 + 2}px` }" />
          {{ s.label }}
        </button>
      </div>
      <span class="sep" />
      <div class="group">
        <button type="button" class="tool" title="撤销（Ctrl+Z）" aria-label="撤销" :disabled="!canUndo" @click="undo">
          <Icon name="undo" :size="17" />
        </button>
        <button type="button" class="tool" title="重做（Ctrl+Y）" aria-label="重做" :disabled="!canRedo" @click="redo">
          <Icon name="redo" :size="17" />
        </button>
        <button
          type="button"
          class="tool"
          title="删除选中的标注（Delete）"
          aria-label="删除选中的标注"
          :disabled="!selectedId"
          @click="removeSelected"
        >
          <Icon name="trash" :size="17" />
        </button>
        <button type="button" class="tool text-btn" :disabled="!items.length" @click="clearAll">清除全部</button>
      </div>
    </div>

    <div ref="area" class="area">
      <div
        ref="frame"
        class="frame"
        :class="`tool-${tool}`"
        :style="{ width: `${display.w}px`, height: `${display.h}px`, cursor: cursorStyle || undefined }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @dblclick="onDblClick"
      >
        <img :src="src" alt="" draggable="false" />
        <AnnotationLayer :annotations="shown" :width="width" :height="height" :hidden-id="textEdit?.id">
          <rect
            v-if="selectionBox"
            class="selection"
            :x="selectionBox.x"
            :y="selectionBox.y"
            :width="selectionBox.w"
            :height="selectionBox.h"
          />
        </AnnotationLayer>
        <textarea
          v-if="textEdit && textBox"
          ref="textArea"
          v-model="textEdit.text"
          class="text-input"
          :style="textBox"
          rows="1"
          spellcheck="false"
          placeholder="输入文字"
          aria-label="标注文字"
          @keydown="onTextKeydown"
          @pointerdown.stop
          @blur="commitText"
        />
      </div>
    </div>

    <p class="hint">
      {{ toolHint }} · <span class="kbd">Ctrl</span>+<span class="kbd">Z</span> 撤销 ·
      <span class="kbd">Esc</span> 退出
    </p>
  </div>
</template>

<style scoped>
.annotator {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  background: rgb(4 7 10 / 0.97);
}
.top {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 8px 20px;
}
.heading {
  display: flex;
  flex: 1;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.heading .eyebrow {
  color: var(--cyan);
}
.name {
  font-weight: 700;
}
.unsaved {
  color: var(--gold);
  font-size: 12px;
}
.save {
  min-width: 84px;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 10px;
  margin: 0 auto;
  padding: 6px 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-card);
}
.group {
  display: flex;
  align-items: center;
  gap: 2px;
}
.sep {
  width: 1px;
  height: 24px;
  background: var(--line-strong);
}
.tool {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
}
.tool:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text);
}
.tool.active {
  border-color: var(--cyan-dim);
  background: var(--cyan-soft);
  color: var(--cyan);
}
.tool:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.text-btn {
  font-size: 12px;
}
.colors {
  gap: 6px;
  padding: 0 2px;
}
.swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 2px solid rgb(255 255 255 / 0.25);
  border-radius: 50%;
  background: var(--sw);
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.5);
  transition: transform 0.1s var(--ease);
}
.swatch:hover {
  transform: scale(1.12);
}
.swatch.active {
  border-color: #fff;
  box-shadow:
    0 0 0 2px var(--surface),
    0 0 0 4px var(--cyan);
}
.sizes button {
  height: 26px;
  padding: 0 9px;
  font-size: 12px;
}
.dot {
  display: inline-block;
  border-radius: 50%;
  background: currentColor;
}
.area {
  position: relative;
  display: grid;
  flex: 1;
  place-items: center;
  min-height: 0;
  overflow: hidden;
}
.frame {
  position: relative;
  touch-action: none;
  user-select: none;
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.5);
}
.frame.tool-pen,
.frame.tool-ellipse,
.frame.tool-arrow {
  cursor: crosshair;
}
.frame.tool-text {
  cursor: text;
}
.frame img {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.selection {
  fill: none;
  stroke: var(--cyan);
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
  vector-effect: non-scaling-stroke;
}
.text-input {
  position: absolute;
  z-index: 1;
  box-sizing: border-box;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  border: 0;
  outline: 2px dashed var(--cyan);
  outline-offset: 2px;
  font-weight: 700;
  white-space: pre;
  resize: none;
}
.text-input::placeholder {
  color: inherit;
  opacity: 0.5;
}
.hint {
  padding: 8px 12px 12px;
  color: var(--text-3);
  font-size: 12px;
  text-align: center;
}
@media (max-width: 720px) {
  .tool-label,
  .unsaved,
  .sep {
    display: none;
  }
}
</style>
