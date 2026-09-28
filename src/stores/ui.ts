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
  danger?: boolean
}

interface ConfirmState extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

export interface LightboxState {
  sources: ImageSource[]
  index: number
  title?: string
}

let toastSeq = 0

export const useUi = defineStore('ui', () => {
  const settingsOpen = ref(false)
  const lightbox = shallowRef<LightboxState | null>(null)
  const toasts = ref<Toast[]>([])
  const confirmState = shallowRef<ConfirmState | null>(null)

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

  function confirm(opts: ConfirmOptions) {
    // 同一时间只保留一个确认框
    confirmState.value?.resolve(false)
    return new Promise<boolean>((resolve) => {
      confirmState.value = { ...opts, resolve }
    })
  }

  function settleConfirm(ok: boolean) {
    const state = confirmState.value
    confirmState.value = null
    state?.resolve(ok)
  }

  return {
    settingsOpen,
    lightbox,
    toasts,
    confirmState,
    openLightbox,
    closeLightbox,
    toast,
    dismissToast,
    confirm,
    settleConfirm,
  }
})
