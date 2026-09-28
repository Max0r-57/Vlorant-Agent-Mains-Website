import { POS_MAX, type Position } from '@/types'

/** 同一位置的 Lineup 组成一个标记点 */
export interface MarkerGroup<T extends Position = Position> {
  key: string
  x: number
  y: number
  items: T[]
}

export function posKey(p: Position) {
  return `${p.x},${p.y}`
}

export function clampPos(v: number) {
  return Math.min(POS_MAX, Math.max(0, Math.round(v)))
}

/** 0–1 的小数坐标 → 保存用的整数坐标 */
export function fromUnit(ux: number, uy: number): Position {
  return { x: clampPos(ux * POS_MAX), y: clampPos(uy * POS_MAX) }
}

export function samePos(a: Position, b: Position) {
  return a.x === b.x && a.y === b.y
}

/**
 * 按坐标分组。坐标完全相同的 Lineup 视为同一位置（显示为一个黑色圆点）。
 * 「相同位置新建」和拖动吸附都会写入完全相同的坐标，所以不需要模糊匹配。
 */
export function groupByPosition<T extends Position>(items: readonly T[]): MarkerGroup<T>[] {
  const map = new Map<string, MarkerGroup<T>>()
  for (const item of items) {
    const key = posKey(item)
    let group = map.get(key)
    if (!group) {
      group = { key, x: item.x, y: item.y, items: [] }
      map.set(key, group)
    }
    group.items.push(item)
  }
  return [...map.values()]
}

/**
 * 找到距离 pos 最近、且屏幕距离不超过 maxPx 的标记点。
 * pxPerUnit：当前缩放下，每个坐标单位对应的屏幕像素（x、y 分别给出，兼容非正方形地图）。
 */
export function findNearestGroup<G extends Position>(
  groups: readonly G[],
  pos: Position,
  maxPx: number,
  pxPerUnit: { x: number; y: number },
): G | null {
  let best: G | null = null
  let bestDist = maxPx
  for (const g of groups) {
    const dx = (g.x - pos.x) * pxPerUnit.x
    const dy = (g.y - pos.y) * pxPerUnit.y
    const d = Math.hypot(dx, dy)
    if (d <= bestDist) {
      best = g
      bestDist = d
    }
  }
  return best
}
