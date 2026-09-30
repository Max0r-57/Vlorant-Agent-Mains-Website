import { onBeforeUnmount, ref } from 'vue'

/**
 * 按住拖动（例如拖动地图上的落点）：移动超过 3 像素才算开始拖动。
 * 事件监听挂在 window 上，拖出元素范围也不会中断。
 */
export function usePointerDrag(handlers: {
  /** 按下时调用；返回 false 表示不拖动 */
  start?: (e: PointerEvent) => boolean | void
  move: (e: PointerEvent) => void
  end?: (e: PointerEvent, moved: boolean) => void
}) {
  const dragging = ref(false)
  let origin: { x: number; y: number; moved: boolean } | null = null

  function cleanup() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  }

  function onDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (handlers.start?.(e) === false) return
    e.preventDefault()
    e.stopPropagation()
    origin = { x: e.clientX, y: e.clientY, moved: false }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  function onMove(e: PointerEvent) {
    if (!origin) return
    if (!origin.moved && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < 3) return
    origin.moved = true
    dragging.value = true
    handlers.move(e)
  }

  function onUp(e: PointerEvent) {
    cleanup()
    const moved = origin?.moved ?? false
    origin = null
    dragging.value = false
    handlers.end?.(e, moved)
  }

  onBeforeUnmount(cleanup)

  return { dragging, onDown }
}
