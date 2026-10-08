import { toRaw } from 'vue'
import type { Annotation, ArrowAnnotation, Position, TextAnnotation } from '@/types'
import { distanceToPolyline } from './geometry'
import { newId } from './id'
import { encode, fit, THUMB_MAX_SIDE, THUMB_QUALITY, type AnyContext2D } from './image'

/**
 * 图片标注：手动圈画、圆圈、箭头、文本框。
 * 坐标和线宽都以原图像素为单位；原图不会被修改，标注单独保存在图片记录里，
 * 查看时用 SVG 叠加显示（AnnotationLayer），保存时再画进缩略图，让卡片和预览里也能看到。
 */

/** 颜色：红、黄、绿、蓝、白、黑 */
export const ANNOTATION_COLORS = ['#ff4655', '#ffd23f', '#3ee07b', '#3d9bff', '#ffffff', '#16191d'] as const

export type SizeLevel = 1 | 2 | 3
export const SIZE_LEVELS: { level: SizeLevel; label: string }[] = [
  { level: 1, label: '细' },
  { level: 2, label: '中' },
  { level: 3, label: '粗' },
]

/** 线宽 / 字号相对于图片长边的比例：同一档在大图和小图上看起来一样粗 */
const STROKE_RATIO: Record<SizeLevel, number> = { 1: 0.0035, 2: 0.0065, 3: 0.011 }
const TEXT_RATIO: Record<SizeLevel, number> = { 1: 0.026, 2: 0.036, 3: 0.05 }

const round1 = (n: number) => Math.round(n * 10) / 10

export function strokeSize(level: SizeLevel, w: number, h: number) {
  return Math.max(1.5, round1(Math.max(w, h) * STROKE_RATIO[level]))
}

export function textSize(level: SizeLevel, w: number, h: number) {
  return Math.max(10, Math.round(Math.max(w, h) * TEXT_RATIO[level]))
}

/** 某个标注最接近哪一档粗细（选中标注时同步工具栏） */
export function levelOf(a: Annotation, w: number, h: number): SizeLevel {
  const sizeFor = a.type === 'text' ? textSize : strokeSize
  let best: SizeLevel = 2
  let bestDiff = Infinity
  for (const { level } of SIZE_LEVELS) {
    const diff = Math.abs(sizeFor(level, w, h) - a.size)
    if (diff < bestDiff) {
      best = level
      bestDiff = diff
    }
  }
  return best
}

export function newAnnotationId() {
  return newId('an')
}

// ---------- 文本框 ----------
export const TEXT_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif'

export function textFont(size: number) {
  return `700 ${size}px ${TEXT_FONT_FAMILY}`
}

let measureCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined

/** 文字宽度：浏览器里用 Canvas 测量；没有 Canvas 时（单元测试）按字数估算 */
export function measureTextWidth(text: string, size: number) {
  if (measureCtx === undefined) {
    measureCtx = null
    try {
      if (typeof OffscreenCanvas !== 'undefined') measureCtx = new OffscreenCanvas(1, 1).getContext('2d')
      else if (typeof document !== 'undefined') measureCtx = document.createElement('canvas').getContext('2d')
    } catch {
      measureCtx = null
    }
  }
  if (measureCtx) {
    measureCtx.font = textFont(size)
    return measureCtx.measureText(text).width
  }
  let w = 0
  for (const ch of text) w += /[⺀-￿]/.test(ch) ? size : size * 0.58
  return w
}

export interface TextLayout {
  lines: string[]
  lineHeight: number
  padX: number
  padY: number
  width: number
  height: number
  radius: number
}

export function layoutText(a: Pick<TextAnnotation, 'text' | 'size'>): TextLayout {
  const lines = a.text.split('\n')
  const lineHeight = a.size * 1.3
  const padX = a.size * 0.4
  const padY = a.size * 0.2
  const textW = Math.max(...lines.map((l) => measureTextWidth(l || ' ', a.size)))
  return {
    lines,
    lineHeight,
    padX,
    padY,
    width: textW + padX * 2,
    height: lines.length * lineHeight + padY * 2,
    radius: a.size * 0.22,
  }
}

/** 文本框底色：深色文字配浅色底，其余配深色底 */
export function textBackground(color: string) {
  const v = parseInt(color.slice(1), 16)
  const lum = (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255
  return lum < 0.35 ? 'rgba(255, 255, 255, 0.82)' : 'rgba(8, 12, 16, 0.62)'
}

// ---------- 几何 ----------
export function penPositions(points: readonly number[]): Position[] {
  const out: Position[] = []
  for (let i = 0; i + 1 < points.length; i += 2) out.push({ x: points[i]!, y: points[i + 1]! })
  return out
}

/** 箭头的各个点：箭身从 tail 画到 shaftEnd（藏在箭头三角形里），head 是三角形 */
export function arrowGeometry(a: Pick<ArrowAnnotation, 'x1' | 'y1' | 'x2' | 'y2' | 'size'>) {
  const dx = a.x2 - a.x1
  const dy = a.y2 - a.y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const head = Math.min(len * 0.6, Math.max(a.size * 3.6, 10))
  const half = head * 0.55
  const bx = a.x2 - ux * head
  const by = a.y2 - uy * head
  return {
    tail: { x: a.x1, y: a.y1 },
    shaftEnd: { x: a.x2 - ux * head * 0.6, y: a.y2 - uy * head * 0.6 },
    head: [
      { x: a.x2, y: a.y2 },
      { x: bx - uy * half, y: by + ux * half },
      { x: bx + uy * half, y: by - ux * half },
    ],
    half,
  }
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

function boxOf(points: readonly Position[], pad: number): Box {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
}

/** 标注占据的范围（含线宽），用于显示选中框 */
export function annotationBounds(a: Annotation): Box {
  switch (a.type) {
    case 'pen':
      return boxOf(penPositions(a.points), a.size / 2)
    case 'ellipse':
      return { x: a.x - a.size / 2, y: a.y - a.size / 2, w: a.w + a.size, h: a.h + a.size }
    case 'arrow': {
      const g = arrowGeometry(a)
      return boxOf([g.tail, ...g.head], a.size / 2)
    }
    case 'text': {
      const t = layoutText(a)
      return { x: a.x, y: a.y, w: t.width, h: t.height }
    }
  }
}

const ONE = { x: 1, y: 1 }

function hits(a: Annotation, p: Position, tol: number) {
  switch (a.type) {
    case 'pen':
      return distanceToPolyline(p, penPositions(a.points), ONE) <= a.size / 2 + tol
    case 'ellipse': {
      // 圆圈内部也算选中，方便点选
      const rx = a.w / 2 + a.size / 2 + tol
      const ry = a.h / 2 + a.size / 2 + tol
      const nx = (p.x - (a.x + a.w / 2)) / rx
      const ny = (p.y - (a.y + a.h / 2)) / ry
      return nx * nx + ny * ny <= 1
    }
    case 'arrow': {
      const g = arrowGeometry(a)
      return distanceToPolyline(p, [g.tail, { x: a.x2, y: a.y2 }], ONE) <= Math.max(a.size / 2, g.half * 0.8) + tol
    }
    case 'text': {
      const b = annotationBounds(a)
      return p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol
    }
  }
}

/** 点中的标注（上面的优先）；tol 为额外的容差（原图像素） */
export function hitTest(list: readonly Annotation[], p: Position, tol: number): Annotation | null {
  for (let i = list.length - 1; i >= 0; i--) {
    if (hits(list[i]!, p, tol)) return list[i]!
  }
  return null
}

export function translateAnnotation(a: Annotation, dx: number, dy: number): Annotation {
  switch (a.type) {
    case 'pen':
      return { ...a, points: a.points.map((v, i) => round1(v + (i % 2 ? dy : dx))) }
    case 'ellipse':
    case 'text':
      return { ...a, x: round1(a.x + dx), y: round1(a.y + dy) }
    case 'arrow':
      return { ...a, x1: round1(a.x1 + dx), y1: round1(a.y1 + dy), x2: round1(a.x2 + dx), y2: round1(a.y2 + dy) }
  }
}

// ---------- 保存 / 读取 ----------
/** 写入 IndexedDB 前转成普通对象（去掉 Vue 的响应式代理） */
export function plainAnnotations(list: readonly Annotation[] | undefined): Annotation[] {
  return (list ?? []).map((item) => {
    const a = toRaw(item)
    return a.type === 'pen' ? { ...a, points: [...toRaw(a.points)] } : { ...a }
  })
}

const MAX_ANNOTATIONS = 500
const MAX_PEN_NUMBERS = 20_000
const MAX_TEXT = 500

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** 校验备份等外部来源里的标注，丢弃不完整的项 */
export function sanitizeAnnotations(v: unknown): Annotation[] {
  if (!Array.isArray(v)) return []
  const out: Annotation[] = []
  for (const a of v.slice(0, MAX_ANNOTATIONS)) {
    if (!isObj(a)) continue
    const id = typeof a.id === 'string' && a.id ? a.id.slice(0, 40) : newAnnotationId()
    const color = typeof a.color === 'string' && /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : ANNOTATION_COLORS[0]
    const size = finite(a.size) && a.size > 0 ? Math.min(a.size, 2000) : 4
    switch (a.type) {
      case 'pen': {
        const nums = Array.isArray(a.points) ? a.points.slice(0, MAX_PEN_NUMBERS) : []
        if (nums.length >= 4 && nums.length % 2 === 0 && nums.every(finite)) {
          out.push({ id, type: 'pen', color, size, points: nums.map(round1) })
        }
        break
      }
      case 'ellipse':
        if ([a.x, a.y, a.w, a.h].every(finite) && (a.w as number) > 0 && (a.h as number) > 0) {
          out.push({ id, type: 'ellipse', color, size, x: a.x as number, y: a.y as number, w: a.w as number, h: a.h as number })
        }
        break
      case 'arrow':
        if ([a.x1, a.y1, a.x2, a.y2].every(finite)) {
          out.push({
            id,
            type: 'arrow',
            color,
            size,
            x1: a.x1 as number,
            y1: a.y1 as number,
            x2: a.x2 as number,
            y2: a.y2 as number,
          })
        }
        break
      case 'text': {
        const text = typeof a.text === 'string' ? a.text.slice(0, MAX_TEXT) : ''
        if (text.trim() && finite(a.x) && finite(a.y)) out.push({ id, type: 'text', color, size, x: a.x, y: a.y, text })
        break
      }
    }
  }
  return out
}

// ---------- 画到 Canvas（生成缩略图） ----------
function roundRect(ctx: AnyContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 把标注画到 Canvas 上；k = Canvas 像素 / 原图像素 */
export function drawAnnotations(ctx: AnyContext2D, list: readonly Annotation[], k: number) {
  ctx.save()
  ctx.scale(k, k)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const a of list) {
    ctx.strokeStyle = a.color
    ctx.fillStyle = a.color
    ctx.lineWidth = a.size
    switch (a.type) {
      case 'pen': {
        const pts = penPositions(a.points)
        ctx.beginPath()
        ctx.moveTo(pts[0]!.x, pts[0]!.y)
        for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y)
        ctx.stroke()
        break
      }
      case 'ellipse':
        ctx.beginPath()
        ctx.ellipse(a.x + a.w / 2, a.y + a.h / 2, a.w / 2, a.h / 2, 0, 0, Math.PI * 2)
        ctx.stroke()
        break
      case 'arrow': {
        const g = arrowGeometry(a)
        ctx.beginPath()
        ctx.moveTo(g.tail.x, g.tail.y)
        ctx.lineTo(g.shaftEnd.x, g.shaftEnd.y)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(g.head[0]!.x, g.head[0]!.y)
        ctx.lineTo(g.head[1]!.x, g.head[1]!.y)
        ctx.lineTo(g.head[2]!.x, g.head[2]!.y)
        ctx.closePath()
        ctx.fill()
        break
      }
      case 'text': {
        const t = layoutText(a)
        ctx.fillStyle = textBackground(a.color)
        roundRect(ctx, a.x, a.y, t.width, t.height, t.radius)
        ctx.fill()
        ctx.fillStyle = a.color
        ctx.font = textFont(a.size)
        ctx.textBaseline = 'middle'
        t.lines.forEach((line, i) => ctx.fillText(line, a.x + t.padX, a.y + t.padY + t.lineHeight * (i + 0.5)))
        break
      }
    }
  }
  ctx.restore()
}

/** 重新生成缩略图：原图缩小后画上标注（没有标注时就是普通缩略图） */
export async function renderAnnotatedThumb(
  img: { blob: Blob; width: number; height: number },
  annotations: readonly Annotation[],
): Promise<Blob> {
  const bitmap = await createImageBitmap(img.blob)
  try {
    const t = fit(bitmap.width, bitmap.height, THUMB_MAX_SIDE)
    const k = t.w / (img.width || bitmap.width)
    return await encode(
      bitmap,
      t.w,
      t.h,
      THUMB_QUALITY,
      annotations.length ? (ctx) => drawAnnotations(ctx, annotations, k) : undefined,
    )
  } finally {
    bitmap.close()
  }
}
