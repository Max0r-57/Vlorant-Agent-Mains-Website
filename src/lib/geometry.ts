import { POS_MAX, type Position } from '@/types'

/**
 * 地图坐标（0–POS_MAX 的整数）与游戏内距离、屏幕像素之间的换算，以及路径 / 圈选区域用到的几何计算。
 */

/** 每个坐标单位对应的游戏内米数；x、y 分开给出，兼容非正方形的地图图片 */
export interface MapMetric {
  x: number
  y: number
}

/** 缩放比例：每个坐标单位对应的长度（例如屏幕像素） */
export interface AxisScale {
  x: number
  y: number
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * widthMeters：地图图片宽度对应的米数；aspect：图片的高 / 宽。
 * 坐标按图片宽、高各自分成 POS_MAX 份，所以非正方形图片的 x、y 单位长度不同。
 */
export function mapMetric(widthMeters: number, aspect = 1): MapMetric {
  return { x: widthMeters / POS_MAX, y: (widthMeters * aspect) / POS_MAX }
}

export function distanceMeters(a: Position, b: Position, metric: MapMetric) {
  return Math.hypot((b.x - a.x) * metric.x, (b.y - a.y) * metric.y)
}

/** 折线总长度（米） */
export function polylineLength(points: readonly Position[], metric: MapMetric) {
  let d = 0
  for (let i = 1; i < points.length; i++) d += distanceMeters(points[i - 1]!, points[i]!, metric)
  return d
}

/** 点是否在多边形内（射线法），多边形首尾自动闭合 */
export function pointInPolygon(p: Position, polygon: readonly Position[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** 多边形面积（按 scale 换算后的单位²，例如屏幕像素²） */
export function polygonArea(polygon: readonly Position[], scale: AxisScale = { x: 1, y: 1 }) {
  let sum = 0
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    sum += b.x * scale.x * (a.y * scale.y) - a.x * scale.x * (b.y * scale.y)
  }
  return Math.abs(sum) / 2
}

/** 点到线段的距离（按 scale 换算） */
function segmentDistance(p: Position, a: Position, b: Position, scale: AxisScale) {
  const px = p.x * scale.x
  const py = p.y * scale.y
  const ax = a.x * scale.x
  const ay = a.y * scale.y
  const dx = b.x * scale.x - ax
  const dy = b.y * scale.y - ay
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** 点到折线的最短距离（按 scale 换算，例如屏幕像素），用于点击选中路径 */
export function distanceToPolyline(p: Position, points: readonly Position[], scale: AxisScale) {
  if (!points.length) return Infinity
  if (points.length === 1) return Math.hypot((p.x - points[0]!.x) * scale.x, (p.y - points[0]!.y) * scale.y)
  let best = Infinity
  for (let i = 1; i < points.length; i++) {
    best = Math.min(best, segmentDistance(p, points[i - 1]!, points[i]!, scale))
  }
  return best
}

/**
 * 折线简化（Ramer–Douglas–Peucker）：去掉偏离不超过 tolerance 的中间点，首尾点保留。
 * tolerance 按 scale 换算，例如传入屏幕像素比例后 tolerance = 1 表示 1 像素。
 */
export function simplifyPath(
  points: readonly Position[],
  tolerance: number,
  scale: AxisScale = { x: 1, y: 1 },
): Position[] {
  if (points.length <= 2) return points.map((p) => ({ x: p.x, y: p.y }))
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [start, end] = stack.pop()!
    let maxDist = 0
    let index = -1
    for (let i = start + 1; i < end; i++) {
      const d = segmentDistance(points[i]!, points[start]!, points[end]!, scale)
      if (d > maxDist) {
        maxDist = d
        index = i
      }
    }
    if (index >= 0 && maxDist > tolerance) {
      keep[index] = 1
      stack.push([start, index], [index, end])
    }
  }
  return points.filter((_, i) => keep[i]).map((p) => ({ x: p.x, y: p.y }))
}

/** 沿折线走到 fraction（0–1）处的位置，用于把序号标在路径中间 */
export function pointAlong(points: readonly Position[], fraction: number, metric: MapMetric): Position {
  if (!points.length) return { x: 0, y: 0 }
  const total = polylineLength(points, metric)
  if (points.length === 1 || total === 0) return { ...points[0]! }
  let remaining = total * Math.min(1, Math.max(0, fraction))
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const d = distanceMeters(a, b, metric)
    if (remaining <= d && d > 0) {
      const t = remaining / d
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    remaining -= d
  }
  return { ...points[points.length - 1]! }
}

export function boundsOf(points: readonly Position[]): Bounds | null {
  if (!points.length) return null
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const p of points) {
    b.minX = Math.min(b.minX, p.x)
    b.minY = Math.min(b.minY, p.y)
    b.maxX = Math.max(b.maxX, p.x)
    b.maxY = Math.max(b.maxY, p.y)
  }
  return b
}

/** 保存用：取整并限制在地图范围内 */
export function roundPos(p: Position): Position {
  return {
    x: Math.min(POS_MAX, Math.max(0, Math.round(p.x))),
    y: Math.min(POS_MAX, Math.max(0, Math.round(p.y))),
  }
}
