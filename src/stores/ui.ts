import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { ImageSource } from '@/types'

export interface Toast {
  id: number
  message: string
  kind: 'success' | 'error' | 'info'
  action?: { label: string; run: () => void }
}

export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  /** 第三个按钮（例如「不保存」），只在 choose() 中使用 */
  altText?: string
  danger?: boolean
}

/** confirm：点了确认；alt：点了第三个按钮；cancel：取消、按 Esc 或点遮罩 */
export type ConfirmResult = 'confirm' | 'alt' | 'cancel'

interface ConfirmState extends ConfirmOptions {
  resolve: (result: ConfirmResult) => void
}

export interface LightboxState {
  sources: ImageSource[]
  index: number
  title?: string
}

let toastSeq = 0

export type SettingsTab = 'types' | 'display' | 'data' | 'about'

export const useUi = defineStore('ui', () => {
  const settingsOpen = ref(false)
  const settingsTab = ref<SettingsTab>('types')
  const lightbox = shallowRef<LightboxState | null>(null)
  const toasts = ref<Toast[]>([])
  const confirmState = shallowRef<ConfirmState | null>(null)

  function openSettings(tab?: SettingsTab) {
    if (tab) settingsTab.value = tab
    settingsOpen.value = true
  }

  function openLightbox(sources: ImageSource[], index = 0, title?: string) {
    if (!sources.length) return
    lightbox.value = { sources, index: Math.min(Math.max(0, index), sources.length - 1), title }
  }

  function closeLightbox() {
    lightbox.value = null
  }

  function dismissToast(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function toast(
    message: string,
    opts: { kind?: Toast['kind']; action?: Toast['action']; duration?: number } = {},
  ) {
    const id = ++toastSeq
    toasts.value = [...toasts.value.slice(-3), { id, message, kind: opts.kind ?? 'success', action: opts.action }]
    const duration = opts.duration ?? (opts.kind === 'error' ? 6000 : opts.action ? 5000 : 2600)
    window.setTimeout(() => dismissToast(id), duration)
    return id
  }

  /** 三选一的确认框（确认 / 第三个按钮 / 取消） */
  function choose(opts: ConfirmOptions) {
    // 同一时间只保留一个确认框
    confirmState.value?.resolve('cancel')
    return new Promise<ConfirmResult>((resolve) => {
      confirmState.value = { ...opts, resolve }
    })
  }

  function confirm(opts: ConfirmOptions) {
    return choose({ ...opts, altText: undefined }).then((r) => r === 'confirm')
  }

  function settleConfirm(result: ConfirmResult | boolean) {
    const state = confirmState.value
    confirmState.value = null
    state?.resolve(result === true ? 'confirm' : result === false ? 'cancel' : result)
  }

  return {
    settingsOpen,
    settingsTab,
    openSettings,
    lightbox,
    toasts,
    confirmState,
    openLightbox,
    closeLightbox,
    toast,
    dismissToast,
    confirm,
    choose,
    settleConfirm,
  }
})
