import { describe, expect, it } from 'vitest'
import { findNearestGroup, fromUnit, groupByPosition, posKey } from '@/lib/positions'

describe('positions', () => {
  it('converts unit coords to clamped integer positions', () => {
    expect(fromUnit(0.5, 0.25)).toEqual({ x: 5000, y: 2500 })
    expect(fromUnit(-0.2, 1.4)).toEqual({ x: 0, y: 10000 })
    expect(fromUnit(0.123456, 0.9999999)).toEqual({ x: 1235, y: 10000 })
  })

  it('groups lineups that share the exact same position', () => {
    const items = [
      { id: 'a', x: 100, y: 100 },
      { id: 'b', x: 100, y: 100 },
      { id: 'c', x: 101, y: 100 },
    ]
    const groups = groupByPosition(items)
    expect(groups).toHaveLength(2)
    const stack = groups.find((g) => g.key === posKey({ x: 100, y: 100 }))!
    expect(stack.items.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('finds the nearest group within a screen-pixel radius', () => {
    const groups = [
      { key: '1000,1000', x: 1000, y: 1000, items: [] },
      { key: '1100,1000', x: 1100, y: 1000, items: [] },
    ]
    // 0.1 px per unit → the groups are 10px apart on screen
    const ppu = { x: 0.1, y: 0.1 }
    expect(findNearestGroup(groups, { x: 1080, y: 1000 }, 18, ppu)?.key).toBe('1100,1000')
    expect(findNearestGroup(groups, { x: 1000, y: 1300 }, 18, ppu)).toBeNull()
    expect(findNearestGroup(groups, { x: 1000, y: 1150 }, 18, ppu)?.key).toBe('1000,1000')
  })
})
