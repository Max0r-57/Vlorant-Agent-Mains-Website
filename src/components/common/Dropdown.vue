<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, provide, ref, watch } from 'vue'
import { useLayer } from '@/composables/useLayer'
import { computePosition, type Placement } from '@/lib/floating'

/**
 * 通用下拉面板：面板渲染到 body，自动翻转 / 限制在视口内，
 * 点击外部或按 Esc 关闭，支持上下方向键在选项间移动焦点（选项加 data-dd-item）。
 */
const props = withDefaults(
  defineProps<{
    placement?: Placement
    /** 面板至少和触发按钮一样宽 */
    matchWidth?: boolean
    width?: number
    disabled?: boolean
    panelClass?: string
  }>(),
  { placement: 'bottom-start' },
)

const open = defineModel<boolean>('open', { default: false })

const triggerEl = ref<HTMLElement>()
const panelEl = ref<HTMLElement>()
const pos = ref({ left: 0, top: 0, maxHeight: 400, minWidth: 0 })

// 嵌套下拉：点击子面板不算「点击外部」
interface DropdownCtx {
  register: (el: () => HTMLElement | undefined) => () => void
}
const DD_KEY = Symbol.for('dropdown-ctx')
const parent = inject<DropdownCtx | null>(DD_KEY, null)
const children = new Set<() => HTMLElement | undefined>()
provide<DropdownCtx>(DD_KEY, {
  register(el) {
    children.add(el)
    return () => children.delete(el)
  },
})
const unregister = parent?.register(() => panelEl.value)
onBeforeUnmount(() => unregister?.())

function contains(target: Node) {
  if (triggerEl.value?.contains(target) || panelEl.value?.contains(target)) return true
  for (const c of children) if (c()?.contains(target)) return true
  return false
}

function toggle() {
  if (!props.disabled) open.value = !open.value
}

function close(refocus = false) {
  open.value = false
  if (refocus) {
    const focusable = triggerEl.value?.querySelector<HTMLElement>('button, [tabindex]')
    focusable?.focus()
  }
}

useLayer(open, () => close(true))

function update() {
  if (!open.value || !triggerEl.value || !panelEl.value) return
  // 包裹层是 display: contents，本身没有尺寸，用触发按钮本身定位
  const anchorEl = (triggerEl.value.firstElementChild as HTMLElement | null) ?? triggerEl.value
  const anchor = anchorEl.getBoundingClientRect()
  const panel = panelEl.value
  const minWidth = props.matchWidth ? anchor.width : 0
  const width = Math.max(props.width ?? panel.offsetWidth, minWidth)
  const r = computePosition(anchor, { width, height: panel.scrollHeight }, props.placement)
  pos.value = { left: r.left, top: r.top, maxHeight: r.maxHeight, minWidth }
}

function onPointerDown(e: PointerEvent) {
  if (!contains(e.target as Node)) close()
}

let ro: ResizeObserver | null = null

watch(open, async (v) => {
  if (v) {
    await nextTick()
    update()
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    ro = new ResizeObserver(update)
    if (panelEl.value) ro.observe(panelEl.value)
    // 聚焦选中项或第一项，方便键盘操作
    const items = itemEls()
    const target = items.find((el) => el.getAttribute('aria-selected') === 'true') ?? items[0]
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'nearest' })
  } else {
    cleanup()
  }
})

function cleanup() {
  document.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('resize', update)
  window.removeEventListener('scroll', update, true)
  ro?.disconnect()
  ro = null
}
onBeforeUnmount(cleanup)

function itemEls() {
  return Array.from(panelEl.value?.querySelectorAll<HTMLElement>('[data-dd-item]') ?? [])
}

function onPanelKeydown(e: KeyboardEvent) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const items = itemEls()
  if (!items.length) return
  e.preventDefault()
  const i = items.indexOf(document.activeElement as HTMLElement)
  const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
  items[next]!.focus()
}

const panelStyle = computed(() => ({
  left: `${pos.value.left}px`,
  top: `${pos.value.top}px`,
  maxHeight: `${pos.value.maxHeight}px`,
  minWidth: pos.value.minWidth ? `${pos.value.minWidth}px` : undefined,
  width: props.width ? `${props.width}px` : undefined,
}))

defineExpose({ close, update })
</script>

<template>
  <div ref="triggerEl" class="dd-trigger">
    <slot name="trigger" :open="open" :toggle="toggle" />
  </div>
  <Teleport to="body">
    <Transition name="dd">
      <div
        v-if="open"
        ref="panelEl"
        class="dd-panel"
        :class="panelClass"
        :style="panelStyle"
        @keydown="onPanelKeydown"
      >
        <slot :close="close" />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dd-trigger {
  display: contents;
}
.dd-panel {
  position: fixed;
  z-index: var(--z-dropdown);
  overflow: auto;
  padding: 6px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
  overscroll-behavior: contain;
}
.dd-enter-active,
.dd-leave-active {
  transition:
    opacity 0.14s var(--ease),
    transform 0.14s var(--ease);
}
.dd-enter-from,
.dd-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
