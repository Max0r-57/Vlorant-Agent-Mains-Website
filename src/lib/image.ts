import type { StoredImage } from '@/types'
import { newId } from './id'

export interface ImageOptions {
  /** 是否压缩原图（关闭则原样保存，只生成缩略图） */
  compress: boolean
  /** 压缩时长边的最大像素 */
  maxSide: number
  /** 0–1 */
  quality: number
}

export const THUMB_MAX_SIDE = 640
const THUMB_QUALITY = 0.8

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif']

export function isImageFile(file: Blob) {
  return file.type.startsWith('image/')
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function canvasToBlob(canvas: AnyCanvas, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality })
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片编码失败'))), type, quality),
  )
}

let webpSupported: boolean | null = null

async function encode(source: ImageBitmap, w: number, h: number, quality: number) {
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!ctx) throw new Error('浏览器不支持 Canvas')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)
  if (webpSupported !== false) {
    const blob = await canvasToBlob(canvas, 'image/webp', quality)
    webpSupported = blob.type === 'image/webp'
    if (webpSupported) return blob
  }
  // 不支持 WebP 编码的浏览器（老版 Safari）退回 JPEG
  return canvasToBlob(canvas, 'image/jpeg', quality)
}

function fit(w: number, h: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)), scale }
}

/**
 * 处理上传的图片：按设置压缩原图，并生成缩略图（卡片 / 预览窗口使用，加载更快）。
 */
export async function processImage(file: Blob, opts: ImageOptions): Promise<StoredImage> {
  if (!isImageFile(file)) throw new Error('不是图片文件')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('无法读取这张图片，可能格式不受支持')
  }
  try {
    const { width, height } = bitmap
    let blob: Blob = file
    let outW = width
    let outH = height
    // GIF 可能是动图，重新编码会丢失动画，所以原样保存
    if (opts.compress && file.type !== 'image/gif') {
      const size = fit(width, height, opts.maxSide)
      const encoded = await encode(bitmap, size.w, size.h, opts.quality)
      // 没有缩小尺寸、而且重新编码后反而更大时，保留原文件
      if (size.scale < 1 || encoded.size < file.size) {
        blob = encoded
        outW = size.w
        outH = size.h
      }
    }
    const t = fit(width, height, THUMB_MAX_SIDE)
    const thumb = await encode(bitmap, t.w, t.h, THUMB_QUALITY)
    return { id: newId('img'), blob, thumb, width: outW, height: outH, createdAt: Date.now() }
  } finally {
    bitmap.close()
  }
}

/** 从剪贴板 / 拖放事件中取出图片文件 */
export function imagesFromDataTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return []
  const files: File[] = []
  for (const f of Array.from(dt.files)) if (isImageFile(f)) files.push(f)
  if (!files.length) {
    for (const item of Array.from(dt.items ?? [])) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile()
        if (f) files.push(f)
      }
    }
  }
  return files
}

export function extForMime(mime: string) {
  switch (mime) {
    case 'image/webp':
      return 'webp'
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/gif':
      return 'gif'
    case 'image/avif':
      return 'avif'
    case 'image/bmp':
      return 'bmp'
    default:
      return 'bin'
  }
}
