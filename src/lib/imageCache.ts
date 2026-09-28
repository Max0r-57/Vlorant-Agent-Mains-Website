import { getImage } from '@/db/repo'

/**
 * 图片 URL 缓存：IndexedDB 里的 Blob → object URL。
 * 缩略图全部缓存；原图只保留最近使用的若干张，避免占用过多内存。
 */
export type ImageVariant = 'full' | 'thumb'

const MAX_FULL = 40

const urls = new Map<string, string>()
const pending = new Map<string, Promise<string | null>>()
const fullOrder: string[] = []

const keyOf = (id: string, variant: ImageVariant) => `${variant}:${id}`

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
    p = getImage(id)
      .then((img) => {
        if (!img) return null
        const url = URL.createObjectURL(variant === 'thumb' ? img.thumb : img.blob)
        urls.set(key, url)
        if (variant === 'full') touchFull(key)
        return url
      })
      .catch(() => null)
      .finally(() => pending.delete(key))
    pending.set(key, p)
  }
  return p
}

export function releaseImages(ids: Iterable<string>) {
  for (const id of ids) {
    for (const variant of ['full', 'thumb'] as const) {
      const key = keyOf(id, variant)
      const url = urls.get(key)
      if (url) URL.revokeObjectURL(url)
      urls.delete(key)
      const i = fullOrder.indexOf(key)
      if (i >= 0) fullOrder.splice(i, 1)
    }
  }
}

export function releaseAllImages() {
  for (const url of urls.values()) URL.revokeObjectURL(url)
  urls.clear()
  fullOrder.length = 0
}
