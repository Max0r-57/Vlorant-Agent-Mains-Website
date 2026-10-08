import { describe, expect, it } from 'vitest'
import { MOVE_MODES, MOVE_MODE_BY_ID, moveSpeed } from '@/data/movement'
import { mapMetric } from '@/lib/geometry'
import { landingSpec } from '@/data/landing'
import {
  buildRoute,
  clampSpikeSeconds,
  formatClock,
  formatDuration,
  landingPhase,
  positionOnRoute,
  SPIKE_SECONDS,
} from '@/lib/rehearsal'
import type { LineupPath } from '@/types'

// 100 m wide map → 1 m = 100 units
const metric = mapMetric(100)

function path(id: string, mode: string, pts: [number, number][]): LineupPath {
  return { id, name: '', mode, points: pts.map(([x, y]) => ({ x, y })) }
}

describe('movement speeds', () => {
  it('matches the given and wiki values', () => {
    expect(moveSpeed('knife')).toBe(6.75)
    expect(moveSpeed('walk')).toBe(3.8)
    expect(moveSpeed('odin')).toBe(5.13)
    expect(moveSpeed('ares')).toBe(5.13)
    expect(moveSpeed('vandal')).toBe(5.4)
    expect(moveSpeed('classic')).toBe(5.73)
    expect(MOVE_MODE_BY_ID.get('odin')?.label).toBe('持奥丁跑')
    expect(new Set(MOVE_MODES.map((m) => m.id)).size).toBe(MOVE_MODES.length)
  })
})

describe('rehearsal route', () => {
  const paths = [
    // 13.5 m with a knife → 2 s
    path('a', 'knife', [
      [0, 0],
      [1350, 0],
    ]),
    // 7.6 m walking → 2 s
    path('b', 'walk', [
      [1350, 0],
      [1350, 760],
    ]),
  ]

  it('times each path with its movement speed', () => {
    const route = buildRoute(paths, metric)
    expect(route.length).toBeCloseTo(21.1)
    expect(route.duration).toBeCloseTo(4)
    expect(route.legs[1]!.start).toBeCloseTo(2)
  })

  it('moves the dot along the paths in order', () => {
    const route = buildRoute(paths, metric)
    expect(positionOnRoute(route, 0)!.pos).toEqual({ x: 0, y: 0 })
    const mid = positionOnRoute(route, 1)!
    expect(mid.legIndex).toBe(0)
    expect(mid.pos.x).toBeCloseTo(675)
    const later = positionOnRoute(route, 3)!
    expect(later.legIndex).toBe(1)
    expect(later.pos.x).toBeCloseTo(1350)
    expect(later.pos.y).toBeCloseTo(380)
    // stays at the end afterwards
    expect(positionOnRoute(route, 99)!.pos).toEqual({ x: 1350, y: 760 })
    expect(positionOnRoute(buildRoute([], metric), 1)).toBeNull()
  })

  it('jumps across gaps between paths without spending time', () => {
    const route = buildRoute(
      [
        path('a', 'knife', [
          [0, 0],
          [675, 0],
        ]),
        path('b', 'knife', [
          [5000, 5000],
          [5675, 5000],
        ]),
      ],
      metric,
    )
    expect(route.duration).toBeCloseTo(2)
    expect(positionOnRoute(route, 1.5)!.pos.x).toBeCloseTo(5337.5)
  })

  it('counts the landing delay before the ability duration', () => {
    expect(landingPhase(0, 2, 7.5)).toEqual({ phase: 'flight', remaining: 2 })
    expect(landingPhase(3, 2, 7.5)).toEqual({ phase: 'active', remaining: 6.5 })
    expect(landingPhase(9.5, 2, 7.5)).toEqual({ phase: 'done', remaining: 0 })
    expect(landingPhase(0, 0, 7.5).phase).toBe('active')
  })

  it('adds the ultimate after the ability when it is turned on', () => {
    // 落点 2 秒 + 燃烧弹 7.5 秒 + 天基光束 7 秒
    expect(landingPhase(5, 2, 7.5, 7)).toEqual({ phase: 'active', remaining: 4.5 })
    expect(landingPhase(9.5, 2, 7.5, 7)).toEqual({ phase: 'ult', remaining: 7 })
    expect(landingPhase(12, 2, 7.5, 7)).toEqual({ phase: 'ult', remaining: 4.5 })
    expect(landingPhase(16.5, 2, 7.5, 7)).toEqual({ phase: 'done', remaining: 0 })
    // 没打开大招时和以前一样
    expect(landingPhase(9.5, 2, 7.5, 0).phase).toBe('done')
    const brim = landingSpec('brimstone')!
    expect(brim.ultimate).toMatchObject({ label: '天基光束', duration: 7 })
    expect(landingSpec('viper')).toBeUndefined()
  })

  it('keeps the spike start time within 0–45 seconds', () => {
    expect(SPIKE_SECONDS).toBe(45)
    expect(clampSpikeSeconds(30)).toBe(30)
    expect(clampSpikeSeconds('25.55')).toBe(25.6)
    expect(clampSpikeSeconds(80)).toBe(45)
    expect(clampSpikeSeconds(-3)).toBe(0)
    expect(clampSpikeSeconds('')).toBe(45)
    expect(clampSpikeSeconds('abc')).toBe(45)
    expect(clampSpikeSeconds(undefined)).toBe(45)
  })

  it('formats clocks to a tenth of a second', () => {
    expect(formatClock(0)).toBe('0.0')
    expect(formatClock(8.29)).toBe('8.2')
    expect(formatClock(44.91, 'ceil')).toBe('45.0')
    expect(formatClock(0.01, 'ceil')).toBe('0.1')
    expect(formatClock(0, 'ceil')).toBe('0.0')
    expect(formatClock(65.34)).toBe('1:05.3')
    expect(formatClock(-1)).toBe('0.0')
    expect(formatDuration(8.25)).toBe('8.3 秒')
    expect(formatDuration(75)).toBe('1 分 15 秒')
  })
})
