import { newId } from '@/lib/id'
import type { ImageSource, StoredImage } from '@/types'

/**
 * 编辑中的图片：可能是已保存的（storedId），也可能是刚上传、还没保存的（draft）。
 */
export interface EditableImage {
  key: string
  storedId?: string
  draft?: StoredImage
  /** 缩略图地址（草稿用） */
  previewUrl?: string
  /** 原图地址（草稿用，查看大图时使用） */
  fullUrl?: string
  status: 'ready' | 'processing' | 'error'
  error?: string
}

export function fromStored(ids: string[]): EditableImage[] {
  return ids.map((id) => ({ key: id, storedId: id, status: 'ready' as const }))
}

export function newEditableKey() {
  return newId('tmp')
}

export function toSource(img: EditableImage): ImageSource | null {
  if (img.storedId) return { kind: 'stored', id: img.storedId }
  const url = img.fullUrl ?? img.previewUrl
  return url ? { kind: 'url', url } : null
}

/** 保存时需要的数据：最终顺序 + 需要新写入的图片 */
export function collectForSave(images: EditableImage[]) {
  const ready = images.filter((i) => i.status === 'ready')
  return {
    imageIds: ready.map((i) => i.storedId ?? i.draft!.id),
    newImages: ready.filter((i) => i.draft && !i.storedId).map((i) => i.draft!),
  }
}

export function hasPendingImages(images: EditableImage[]) {
  return images.some((i) => i.status === 'processing')
}
