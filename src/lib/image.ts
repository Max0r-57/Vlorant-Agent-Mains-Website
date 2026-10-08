import type { StoredImage } from '@/types'
import { formatBytes } from './format'
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
export const THUMB_QUALITY = 0.8

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif']

export function isImageFile(file: Blob) {
  return file.type.startsWith('image/')
}

/** 单个视频的大小上限 */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024

/** 文件选择框接受的类型：部分系统不认识 .mkv / .mov 的类型，所以把扩展名也列上 */
export const MEDIA_ACCEPT = 'image/*,video/*,.mp4,.m4v,.webm,.mov,.mkv'

const VIDEO_TYPES_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  ogv: 'video/ogg',
}

function videoTypeFromName(name: string | undefined) {
  const ext = name?.split('.').pop()?.toLowerCase()
  return ext ? VIDEO_TYPES_BY_EXT[ext] : undefined
}

export function isVideoFile(file: Blob & { name?: string }) {
  return file.type.startsWith('video/') || (!file.type && !!videoTypeFromName(file.name))
}

export function isMediaFile(file: Blob & { name?: string }) {
  return isImageFile(file) || isVideoFile(file)
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas

export function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

export function canvasToBlob(canvas: AnyCanvas, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality })
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片编码失败'))), type, quality),
  )
}

let webpSupported: boolean | null = null

export type AnyContext2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/**
 * 把图片缩放到 w × h 并编码成 WebP（不支持时用 JPEG）。
 * draw：在缩放后的画面上再画一些东西（例如图片标注）。
 */
export async function encode(
  source: ImageBitmap,
  w: number,
  h: number,
  quality: number,
  draw?: (ctx: AnyContext2D) => void,
) {
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d') as AnyContext2D | null
  if (!ctx) throw new Error('浏览器不支持 Canvas')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)
  draw?.(ctx)
  return encodeCanvas(canvas, quality)
}

async function encodeCanvas(canvas: AnyCanvas, quality: number) {
  if (webpSupported !== false) {
    const blob = await canvasToBlob(canvas, 'image/webp', quality)
    webpSupported = blob.type === 'image/webp'
    if (webpSupported) return blob
  }
  // 不支持 WebP 编码的浏览器（老版 Safari）退回 JPEG
  return canvasToBlob(canvas, 'image/jpeg', quality)
}

export function fit(w: number, h: number, maxSide: number) {
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

/** 等待元素触发 ok 事件；先触发 fail 事件或超时则失败 */
function waitEvent(target: EventTarget, ok: string, fail: string, ms: number) {
  return new Promise<void>((resolve, reject) => {
    const done = (err?: Error) => {
      target.removeEventListener(ok, onOk)
      target.removeEventListener(fail, onFail)
      clearTimeout(timer)
      if (err) reject(err)
      else resolve()
    }
    const onOk = () => done()
    const onFail = () => done(new Error(fail))
    const timer = setTimeout(() => done(new Error('timeout')), ms)
    target.addEventListener(ok, onOk)
    target.addEventListener(fail, onFail)
  })
}

const VIDEO_DECODE_ERROR = '无法读取这个视频，浏览器可能不支持它的编码格式，请转成 MP4（H.264）后再上传'

/**
 * 处理上传的视频：原文件不做改动（不压缩），读取尺寸和时长，并截取约第 1 秒的画面作为封面（缩略图）。
 */
export async function processVideo(file: Blob & { name?: string }): Promise<StoredImage> {
  if (!isVideoFile(file)) throw new Error('不是视频文件')
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error(`视频太大（${formatBytes(file.size)}），单个视频最大 ${formatBytes(MAX_VIDEO_BYTES)}`)
  }
  // 存成普通 Blob（不保留文件名），类型为空时按扩展名补上
  const blob = file.slice(0, file.size, file.type || videoTypeFromName(file.name) || 'video/mp4')
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  try {
    const loaded = waitEvent(video, 'loadeddata', 'error', 20_000)
    video.src = url
    await loaded.catch(() => {
      throw new Error(VIDEO_DECODE_ERROR)
    })
    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) throw new Error('这个文件没有视频画面')
    let duration = video.duration
    if (!Number.isFinite(duration)) {
      // 部分网页录制的 WebM 没有写入时长：跳到末尾，让浏览器算出时长
      const seeked = waitEvent(video, 'seeked', 'error', 8000).catch(() => {})
      video.currentTime = 1e7
      await seeked
      duration = Number.isFinite(video.duration) ? video.duration : 0
    }
    // 封面取第 1 秒左右的画面（很短的视频取中间），避开开头的黑屏
    const at = duration > 0 ? Math.min(1, duration / 2) : 0
    if (Math.abs(video.currentTime - at) > 0.01) {
      const seeked = waitEvent(video, 'seeked', 'error', 8000).catch(() => {})
      video.currentTime = at
      await seeked
    }
    let frame: ImageBitmap
    try {
      frame = await createImageBitmap(video)
    } catch {
      throw new Error(VIDEO_DECODE_ERROR)
    }
    try {
      const t = fit(width, height, THUMB_MAX_SIDE)
      const thumb = await encode(frame, t.w, t.h, THUMB_QUALITY)
      return {
        id: newId('vid'),
        kind: 'video',
        blob,
        thumb,
        width,
        height,
        duration: Math.round(duration * 100) / 100,
        createdAt: Date.now(),
      }
    } finally {
      frame.close()
    }
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

/** 从剪贴板 / 拖放事件中取出图片和视频文件 */
export function mediaFromDataTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return []
  const files: File[] = []
  for (const f of Array.from(dt.files)) if (isMediaFile(f)) files.push(f)
  if (!files.length) {
    for (const item of Array.from(dt.items ?? [])) {
      if (item.kind === 'file' && (item.type.startsWith('image/') || item.type.startsWith('video/'))) {
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
    case 'video/mp4':
      return 'mp4'
    case 'video/x-m4v':
      return 'm4v'
    case 'video/webm':
      return 'webm'
    case 'video/quicktime':
      return 'mov'
    case 'video/x-matroska':
      return 'mkv'
    case 'video/ogg':
      return 'ogv'
    default:
      return 'bin'
  }
}
