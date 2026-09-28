import { onBeforeUnmount, ref } from 'vue'

/**
 * 标记点预览窗口的开关逻辑：
 * 鼠标移入标记点打开，移出后稍等片刻再关闭（给鼠标移进预览窗口留时间）；
 * 点击标记点会「固定」窗口，直到点击空白处或按 Esc。
 */
export function useMarkerPopover() {
  const state = ref<{ key: string; pinned: boolean; focusId: string | null } | null>(null)
  let openTimer = 0
  let closeTimer = 0

  function clearTimers() {
    window.clearTimeout(openTimer)
    window.clearTimeout(closeTimer)
  }

  function hoverEnter(key: string) {
    window.clearTimeout(closeTimer)
    if (state.value?.key === key) return
    window.clearTimeout(openTimer)
    // 已经有窗口打开时立即切换，否则稍作延迟避免划过时闪烁
    const delay = state.value ? 0 : 80
    openTimer = window.setTimeout(() => {
      state.value = { key, pinned: false, focusId: null }
    }, delay)
  }

  function hoverLeave() {
    window.clearTimeout(openTimer)
    if (!state.value || state.value.pinned) return
    closeTimer = window.setTimeout(() => {
      if (state.value && !state.value.pinned) state.value = null
    }, 220)
  }

  function popoverEnter() {
    window.clearTimeout(closeTimer)
  }

  function pin(key: string, focusId: string | null = null) {
    clearTimers()
    state.value = { key, pinned: true, focusId }
  }

  function toggle(key: string) {
    if (state.value?.key === key && state.value.pinned) close()
    else pin(key, state.value?.key === key ? state.value.focusId : null)
  }

  function close() {
    clearTimers()
    state.value = null
  }

  onBeforeUnmount(clearTimers)

  return { state, hoverEnter, hoverLeave, popoverEnter, popoverLeave: hoverLeave, pin, toggle, close }
}
