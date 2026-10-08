import { ref } from 'vue'
import { getImage } from '@/db/repo'
import type { Annotation, MediaKind, StoredImage } from '@/types'

/**
 * 图片 / 视频的 URL 缓存：IndexedDB 里的 Blob → object URL。
 * 缩略图全部缓存；原图和视频只保留最近使用的若干个，避免占用过多内存。
 * 同时缓存媒体信息（类型、尺寸、时长、标注），列表里显示视频角标、查看器里显示标注都用它。
 */
export type ImageVariant = 'full' | 'thumb'

export interface MediaInfo {
  kind: MediaKind
  width: number
  height: number
  /** 视频时长（秒），图片为 0 */
  duration: number
  annotations: readonly Annotation[]
}

const MAX_FULL = 40

const urls = new Map<string, string>()
const pending = new Map<string, Promise<string | null>>()
const fullOrder: string[] = []
const infos = new Map<string, MediaInfo>()
const pendingInfo = new Map<string, Promise<MediaInfo | null>>()

/** 有媒体被修改（例如保存了标注、重新生成了缩略图）时加一，显示缩略图的地方据此重新读取 */
export const mediaRevision = ref(0)

const keyOf = (id: string, variant: ImageVariant) => `${variant}:${id}`

export function mediaInfoOf(img: StoredImage): MediaInfo {
  return {
    kind: img.kind ?? 'image',
    width: img.width,
    height: img.height,
    duration: img.duration ?? 0,
    annotations: img.annotations ?? [],
  }
}

function touchFull(key: string) {
  const i = fullOrder.indexOf(key)
  if (i >= 0) fullOrder.splice(i, 1)
  fullOrder.push(key)
  while (fullOrder.length > MAX_FULL) {
    const old = fullOrder.shift()!
    const url = urls.get(old)
    if (url) URL.revokeObjectURL(url)
    urls.delete(old)
  }
}

export function peekImageUrl(id: string, variant: ImageVariant) {
  const key = keyOf(id, variant)
  const url = urls.get(key)
  if (url && variant === 'full') touchFull(key)
  return url
}

export function getImageUrl(id: string, variant: ImageVariant): Promise<string | null> {
  const key = keyOf(id, variant)
  const cached = peekImageUrl(id, variant)
  if (cached) return Promise.resolve(cached)
  let p = pending.get(key)
  if (!p) {
    const req: Promise<string | null> = getImage(id)
      .then((img) => {
        if (!img) return null
        const url = URL.createObjectURL(variant === 'thumb' ? img.thumb : img.blob)
        // 读取期间媒体被修改过（refreshImages）：结果可能是旧的，不放进缓存
        if (pending.get(key) === req) {
          infos.set(id, mediaInfoOf(img))
          urls.set(key, url)
          if (variant === 'full') touchFull(key)
        }
        return url
      })
      .catch(() => null)
      .finally(() => {
        if (pending.get(key) === req) pending.delete(key)
      })
    pending.set(key, req)
    p = req
  }
  return p
}

export function peekMediaInfo(id: string) {
  return infos.get(id)
}

export function getMediaInfo(id: string): Promise<MediaInfo | null> {
  const cached = infos.get(id)
  if (cached) return Promise.resolve(cached)
  let p = pendingInfo.get(id)
  if (!p) {
    const req: Promise<MediaInfo | null> = getImage(id)
      .then((img) => {
        if (!img) return null
        const info = mediaInfoOf(img)
        if (pendingInfo.get(id) === req) infos.set(id, info)
        return info
      })
      .catch(() => null)
      .finally(() => {
        if (pendingInfo.get(id) === req) pendingInfo.delete(id)
      })
    pendingInfo.set(id, req)
    p = req
  }
  return p
}

export function releaseImages(ids: Iterable<string>) {
  for (const id of ids) {
    infos.delete(id)
    pendingInfo.delete(id)
    for (const variant of ['full', 'thumb'] as const) {
      const key = keyOf(id, variant)
      pending.delete(key)
      const url = urls.get(key)
      if (url) URL.revokeObjectURL(url)
      urls.delete(key)
      const i = fullOrder.indexOf(key)
      if (i >= 0) fullOrder.splice(i, 1)
    }
  }
}

/** 媒体被修改后调用：丢掉旧的缓存，让界面重新读取 */
export function refreshImages(ids: Iterable<string>) {
  releaseImages(ids)
  mediaRevision.value++
}

export function releaseAllImages() {
  for (const url of urls.values()) URL.revokeObjectURL(url)
  urls.clear()
  pending.clear()
  infos.clear()
  pendingInfo.clear()
  fullOrder.length = 0
}
