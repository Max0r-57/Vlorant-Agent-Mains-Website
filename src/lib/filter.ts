import type { Lineup, Position } from '@/types'
import { parseDateInput } from './format'
import { pointInPolygon } from './geometry'

export type TimePreset = 'all' | '7d' | '30d' | '90d' | 'custom'

export interface TimeFilter {
  preset: TimePreset
  /** YYYY-MM-DD，仅 custom 时使用 */
  from?: string
  to?: string
}

export const TIME_PRESETS: { value: TimePreset; label: string }[] = [
  { value: 'all', label: '全部时间' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: '90d', label: '近 90 天' },
  { value: 'custom', label: '自定义' },
]

export interface LineupFilter {
  /** 为空表示全部 */
  mapId?: string | null
  agentId?: string | null
  query?: string
  /** 为空数组表示全部类型 */
  typeIds?: string[]
  time?: TimeFilter
  /** 区域搜索：只保留落点在这个多边形内的 Lineup（没有落点的不算） */
  area?: readonly Position[] | null
  /** 手动隐藏的 Lineup */
  excludeIds?: readonly string[]
}

const DAY = 24 * 60 * 60 * 1000

/** 把时间筛选解析成 [开始, 结束] 毫秒区间，null 表示不限 */
export function resolveTimeRange(
  time: TimeFilter | undefined,
  now = Date.now(),
): [number | null, number | null] {
  if (!time || time.preset === 'all') return [null, null]
  if (time.preset === 'custom') {
    const from = time.from ? parseDateInput(time.from) : null
    const to = time.to ? parseDateInput(time.to) : null
    // 结束日期包含当天整天
    return [from, to === null ? null : to + DAY - 1]
  }
  const days = time.preset === '7d' ? 7 : time.preset === '30d' ? 30 : 90
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return [start.getTime() - (days - 1) * DAY, null]
}

export function describeTime(time: TimeFilter | undefined) {
  if (!time || time.preset === 'all') return '全部时间'
  if (time.preset !== 'custom') return TIME_PRESETS.find((p) => p.value === time.preset)!.label
  if (time.from && time.to) return `${time.from.slice(5)} ~ ${time.to.slice(5)}`
  if (time.from) return `${time.from} 起`
  if (time.to) return `至 ${time.to}`
  return '全部时间'
}

export function isTimeActive(time: TimeFilter | undefined) {
  const [a, b] = resolveTimeRange(time)
  return a !== null || b !== null
}

export interface SearchContext {
  typeName?: (id: string) => string
  agentName?: (id: string) => string
  mapName?: (id: string) => string
}

export function tokenize(query: string | undefined) {
  return (query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 关键词匹配：名字、备注、类型、英雄、地图，多个关键词之间是「且」的关系 */
export function matchesQuery(l: Lineup, tokens: string[], ctx: SearchContext = {}) {
  if (!tokens.length) return true
  const haystack = [
    l.name,
    l.note,
    ctx.typeName?.(l.typeId) ?? '',
    ctx.agentName?.(l.agentId) ?? '',
    ctx.mapName?.(l.mapId) ?? '',
  ]
    .join('\n')
    .toLowerCase()
  return tokens.every((t) => haystack.includes(t))
}

export function filterLineups(
  lineups: readonly Lineup[],
  filter: LineupFilter,
  ctx: SearchContext = {},
  now = Date.now(),
): Lineup[] {
  const tokens = tokenize(filter.query)
  const types = filter.typeIds?.length ? new Set(filter.typeIds) : null
  const excluded = filter.excludeIds?.length ? new Set(filter.excludeIds) : null
  const area = filter.area && filter.area.length >= 3 ? filter.area : null
  const [from, to] = resolveTimeRange(filter.time, now)
  return lineups.filter(
    (l) =>
      (!filter.mapId || l.mapId === filter.mapId) &&
      (!filter.agentId || l.agentId === filter.agentId) &&
      (!types || types.has(l.typeId)) &&
      (!excluded || !excluded.has(l.id)) &&
      (from === null || l.createdAt >= from) &&
      (to === null || l.createdAt <= to) &&
      (!area || (!!l.landing && pointInPolygon(l.landing, area))) &&
      matchesQuery(l, tokens, ctx),
  )
}

export type SortKey = 'name' | 'agent' | 'map' | 'type' | 'createdAt'
export type SortDir = 'asc' | 'desc'

const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' })

export function sortLineups(
  lineups: readonly Lineup[],
  key: SortKey,
  dir: SortDir,
  ctx: SearchContext = {},
): Lineup[] {
  const label = (l: Lineup): string => {
    switch (key) {
      case 'name':
        return l.name
      case 'agent':
        return ctx.agentName?.(l.agentId) ?? l.agentId
      case 'map':
        return ctx.mapName?.(l.mapId) ?? l.mapId
      case 'type':
        return ctx.typeName?.(l.typeId) ?? l.typeId
      default:
        return ''
    }
  }
  const sign = dir === 'asc' ? 1 : -1
  return [...lineups].sort((a, b) => {
    const primary =
      key === 'createdAt' ? a.createdAt - b.createdAt : collator.compare(label(a), label(b))
    // 相同时按创建时间倒序，保证顺序稳定
    return primary !== 0 ? primary * sign : b.createdAt - a.createdAt
  })
}
