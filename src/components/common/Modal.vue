<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useLayer } from '@/composables/useLayer'
import Icon from './Icon.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    width?: number
    /** 点击遮罩关闭 */
    dismissible?: boolean
    zIndex?: string
  }>(),
  { width: 520, dismissible: true },
)
const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement>()
let lastFocus: HTMLElement | null = null

useLayer(() => props.open, () => emit('close'))

watch(
  () => props.open,
  async (v) => {
    if (v) {
      lastFocus = document.activeElement as HTMLElement | null
      await nextTick()
      const auto = panel.value?.querySelector<HTMLElement>('[autofocus]')
      ;(auto ?? panel.value)?.focus({ preventScroll: true })
    } else {
      lastFocus?.focus?.({ preventScroll: true })
      lastFocus = null
    }
  },
  { immediate: true },
)

// 只有在遮罩上按下并松开才算点击遮罩，避免在弹窗里拖选文字时误关闭
let downOnBackdrop = false
function onBackdropDown(e: PointerEvent) {
  downOnBackdrop = e.target === e.currentTarget
}
function onBackdropUp(e: PointerEvent) {
  if (props.dismissible && downOnBackdrop && e.target === e.currentTarget) emit('close')
  downOnBackdrop = false
}

// 焦点限制在弹窗内
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Tab' || !panel.value) return
  const focusables = Array.from(
    panel.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null)
  if (!focusables.length) return
  const first = focusables[0]!
  const last = focusables[focusables.length - 1]!
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="backdrop"
        :style="zIndex ? { zIndex } : undefined"
        @pointerdown="onBackdropDown"
        @pointerup="onBackdropUp"
      >
        <div
          ref="panel"
          class="modal"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          tabindex="-1"
          :style="{ width: `min(${width}px, calc(100vw - 32px))` }"
          @keydown="onKeydown"
        >
          <header v-if="title || $slots.header" class="modal-head">
            <slot name="header">
              <h2 class="modal-title">{{ title }}</h2>
            </slot>
            <button type="button" class="btn btn-ghost btn-icon btn-sm close" aria-label="关闭" @click="emit('close')">
              <Icon name="x" :size="18" />
            </button>
          </header>
          <div class="modal-body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="modal-foot">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(3 6 9 / 0.66);
  backdrop-filter: blur(3px);
}
.modal {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 32px);
  max-height: calc(100dvh - 32px);
  border: 1px solid var(--line-strong);
  border-radius: var(--r-lg);
  background: var(--bg-elev);
  box-shadow: var(--shadow-pop);
  outline: none;
}
.modal-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 14px 12px 20px;
  border-bottom: 1px solid var(--line);
}
.modal-title {
  flex: 1;
  font-size: 16px;
  font-weight: 700;
}
.close {
  margin-left: auto;
}
.modal-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--line);
}
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.18s var(--ease);
}
.modal-enter-active .modal,
.modal-leave-active .modal {
  transition: transform 0.18s var(--ease);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal,
.modal-leave-to .modal {
  transform: translateY(8px) scale(0.985);
}
</style>
