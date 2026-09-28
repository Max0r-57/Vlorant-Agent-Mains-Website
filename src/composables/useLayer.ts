import { onBeforeUnmount, watch, type WatchSource } from 'vue'

/**
 * 浮层栈：按 Esc 时只关闭最上面的一层（下拉 → 弹窗 → 页面面板）。
 */
interface Layer {
  close: () => void
}

const stack: Layer[] = []
let installed = false

function install() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener(
    'keydown',
    (e) => {
      // 输入法正在组字时按 Esc 是取消组字，不应关闭浮层
      if (e.key !== 'Escape' || e.isComposing || !stack.length) return
      e.preventDefault()
      e.stopPropagation()
      stack[stack.length - 1]!.close()
    },
    true,
  )
}

export function useLayer(open: WatchSource<boolean>, close: () => void) {
  install()
  const layer: Layer = { close }
  const remove = () => {
    const i = stack.indexOf(layer)
    if (i >= 0) stack.splice(i, 1)
  }
  watch(
    open,
    (v) => {
      remove()
      if (v) stack.push(layer)
    },
    { immediate: true },
  )
  onBeforeUnmount(remove)
}

export function hasOpenLayer() {
  return stack.length > 0
}
