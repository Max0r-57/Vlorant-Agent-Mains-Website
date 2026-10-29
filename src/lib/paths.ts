import { newId } from './id'
import type { Landing, Lineup, LineupPath, PathRoute, Position } from '@/types'
import { roundPos } from './geometry'

/** 落点时间的上限（秒） */
export const MAX_LANDING_DELAY = 60

/** 路径版本名称的最大长度 */
export const MAX_ROUTE_NAME = 20

/** 路径版本的显示名称：没有自定义名称时为「版本 N」（N 从 1 开始） */
export function routeName(route: Pick<PathRoute, 'name'> | null | undefined, index: number) {
  return route?.name.trim() || `版本${index + 1}`
}

/** 默认版本（第一个版本）的路径：地图上默认显示它 */
export function mainPaths(l: Pick<Lineup, 'routes'>): LineupPath[] {
  return l.routes[0]?.paths ?? []
}

/** 有没有路径追踪（任意一个版本有路径） */
export function hasPaths(l: Pick<Lineup, 'routes'>) {
  return l.routes.some((r) => r.paths.length > 0)
}

export function newRouteId() {
  return newId('route')
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
    mode: p.mode,
    points: p.points.map((q) => ({ x: q.x, y: q.y })),
  }))
}

/** 路径版本转成普通对象；没有路径的版本不保存 */
export function plainRoutes(routes: readonly PathRoute[] | null | undefined): PathRoute[] {
  return (routes ?? [])
    .filter((r) => r.paths.length > 0)
    .map((r) => ({ id: r.id, name: r.name.trim().slice(0, MAX_ROUTE_NAME), paths: plainPaths(r.paths) }))
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
    out.push({ id, mode: typeof p.mode === 'string' ? p.mode : '', points })
  }
  return out
}

/**
 * 读取数据库 / 备份时校验路径版本，去掉没有路径的版本。
 * legacyPaths：旧版本数据只有一组路径（paths 字段），转成「版本1」。
 */
export function sanitizeRoutes(v: unknown, legacyPaths?: unknown): PathRoute[] {
  const seen = new Set<string>()
  const out: PathRoute[] = []
  if (Array.isArray(v)) {
    for (const r of v) {
      if (!isObj(r)) continue
      const paths = sanitizePaths(r.paths)
      if (!paths.length) continue
      let id = typeof r.id === 'string' && r.id ? r.id : newRouteId()
      if (seen.has(id)) id = newRouteId()
      seen.add(id)
      out.push({ id, name: typeof r.name === 'string' ? r.name.trim().slice(0, MAX_ROUTE_NAME) : '', paths })
    }
    return out
  }
  // 固定的 id：旧数据每次读取都得到同一个版本 id（只需要在同一个 Lineup 里不重复）
  const paths = sanitizePaths(legacyPaths)
  return paths.length ? [{ id: 'route_1', name: '', paths }] : []
}
