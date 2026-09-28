import { describe, expect, it } from 'vitest'
import { filterLineups, resolveTimeRange, sortLineups } from '@/lib/filter'
import type { Lineup } from '@/types'

const day = 24 * 60 * 60 * 1000
const now = new Date(2026, 8, 28, 15, 0).getTime()

function make(p: Partial<Lineup>): Lineup {
  return {
    id: p.id ?? Math.random().toString(36),
    name: 'lineup',
    typeId: 'molly',
    agentId: 'brimstone',
    mapId: 'ascent',
    x: 0,
    y: 0,
    imageIds: [],
    note: '',
    createdAt: now,
    updatedAt: now,
    ...p,
  }
}

const data = [
  make({ id: '1', name: 'A 点默认包点燃烧弹', note: '站在A大门口', createdAt: now - 2 * day }),
  make({ id: '2', name: 'B 点烟', typeId: 'smoke', createdAt: now - 10 * day }),
  make({ id: '3', name: '中路燃烧弹', mapId: 'haven', createdAt: now - 40 * day }),
  make({ id: '4', name: 'A 点蝰蛇墙', agentId: 'viper', typeId: 'smoke', createdAt: now }),
]

const ctx = { typeName: (id: string) => (id === 'molly' ? '燃烧弹' : '烟雾') }

describe('filterLineups', () => {
  it('filters by map and agent', () => {
    const r = filterLineups(data, { mapId: 'ascent', agentId: 'brimstone' }, ctx, now)
    expect(r.map((l) => l.id)).toEqual(['1', '2'])
  })

  it('matches every keyword against name, note and type name', () => {
    expect(filterLineups(data, { query: 'A 大门' }, ctx, now).map((l) => l.id)).toEqual(['1'])
    expect(filterLineups(data, { query: '烟雾' }, ctx, now).map((l) => l.id)).toEqual(['2', '4'])
  })

  it('filters by types', () => {
    expect(filterLineups(data, { typeIds: ['smoke'] }, ctx, now).map((l) => l.id)).toEqual(['2', '4'])
    expect(filterLineups(data, { typeIds: [] }, ctx, now)).toHaveLength(4)
  })

  it('filters by time presets and custom ranges (inclusive end day)', () => {
    expect(filterLineups(data, { time: { preset: '7d' } }, ctx, now).map((l) => l.id)).toEqual(['1', '4'])
    expect(filterLineups(data, { time: { preset: '30d' } }, ctx, now)).toHaveLength(3)
    const r = filterLineups(
      data,
      { time: { preset: 'custom', from: '2026-09-18', to: '2026-09-26' } },
      ctx,
      now,
    )
    expect(r.map((l) => l.id)).toEqual(['1', '2'])
  })

  it('resolves open-ended custom ranges', () => {
    const [from, to] = resolveTimeRange({ preset: 'custom', from: '2026-09-01' }, now)
    expect(from).toBe(new Date(2026, 8, 1).getTime())
    expect(to).toBeNull()
  })
})

describe('sortLineups', () => {
  it('sorts by created time and by name', () => {
    expect(sortLineups(data, 'createdAt', 'desc').map((l) => l.id)).toEqual(['4', '1', '2', '3'])
    // 中文按拼音排序：蝰(kui) 在 默(mo) 之前
    const byName = sortLineups(data, 'name', 'asc')
      .map((l) => l.name)
      .filter((n) => /^[AB]/.test(n))
    expect(byName).toEqual(['A 点蝰蛇墙', 'A 点默认包点燃烧弹', 'B 点烟'])
  })
})
