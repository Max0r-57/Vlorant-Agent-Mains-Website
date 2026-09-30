import { newId } from './id'
import type { Landing, LineupPath, Position } from '@/types'
import { roundPos } from './geometry'

/** 落点时间的上限（秒） */
export const MAX_LANDING_DELAY = 60

/** 路径的显示名称：没有自定义名称时为「路径 N」（N 为序号） */
export function pathName(path: Pick<LineupPath, 'name'>, index: number) {
  return path.name.trim() || `路径${index + 1}`
}

/** 落点时间：非负、最多一位小数；不合法或为空时返回 null */
export function normalizeDelay(v: unknown): number | null {
  const n = typeof v === 'string' ? (v.trim() ? Number(v) : NaN) : typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n) || n < 0) return null
  return Math.min(MAX_LANDING_DELAY, Math.round(n * 10) / 10)
}

/*
 * 写入 IndexedDB 前转成普通对象：界面里的落点 / 路径可能是 Vue 的响应式代理，
 * 直接保存会触发 DataCloneError，所以逐个字段复制。
 */
export function plainLanding(l: Landing | null | undefined): Landing | null {
  if (!l) return null
  return { x: l.x, y: l.y, delay: l.delay ?? null }
}

export function plainPaths(paths: readonly LineupPath[] | null | undefined): LineupPath[] {
  return (paths ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    mode: p.mode,
    points: p.points.map((q) => ({ x: q.x, y: q.y })),
  }))
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function toPos(v: unknown): Position | null {
  if (!isObj(v) || typeof v.x !== 'number' || typeof v.y !== 'number') return null
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) return null
  return roundPos({ x: v.x, y: v.y })
}

/** 读取数据库 / 备份时校验落点，不合法的当作没有落点 */
export function sanitizeLanding(v: unknown): Landing | null {
  const pos = toPos(v)
  if (!pos || !isObj(v)) return null
  return { ...pos, delay: normalizeDelay(v.delay) }
}

/** 读取数据库 / 备份时校验路径，去掉点数不足的路径 */
export function sanitizePaths(v: unknown): LineupPath[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  const out: LineupPath[] = []
  for (const p of v) {
    if (!isObj(p) || !Array.isArray(p.points)) continue
    const points = p.points.map(toPos).filter((q): q is Position => !!q)
    if (points.length < 2) continue
    let id = typeof p.id === 'string' && p.id ? p.id : newId('path')
    if (seen.has(id)) id = newId('path')
    seen.add(id)
    out.push({
      id,
      name: typeof p.name === 'string' ? p.name.slice(0, 30) : '',
      mode: typeof p.mode === 'string' ? p.mode : '',
      points,
    })
  }
  return out
}
