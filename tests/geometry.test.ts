import { describe, expect, it } from 'vitest'
import { DEFAULT_MAP_WIDTH_METERS } from '@/data/maps'
import {
  distanceMeters,
  distanceToPolyline,
  mapMetric,
  pointAlong,
  pointInPolygon,
  polygonArea,
  polylineLength,
  simplifyPath,
} from '@/lib/geometry'
import { normalizeDelay, routeName, sanitizeLanding, sanitizePaths, sanitizeRoutes } from '@/lib/paths'

describe('map scale', () => {
  it('uses the Ascent reference room (20 m = 144.5 px of the 1024 px image)', () => {
    const m = mapMetric(DEFAULT_MAP_WIDTH_METERS)
    // 参考图里的红线：y = 738，x 从 497.5 到 642（144.5 / 1024 of the map width）
    const toPos = (px: number) => (px / 1024) * 10000
    const d = distanceMeters({ x: toPos(497.5), y: toPos(738) }, { x: toPos(642), y: toPos(738) }, m)
    expect(d).toBeCloseTo(20, 1)
    // 1 m ≈ 7.2 px; the 7 m molly is ≈ 51 px across on the 1024 px image
    expect(1024 / DEFAULT_MAP_WIDTH_METERS).toBeCloseTo(7.23, 2)
    expect((7 / DEFAULT_MAP_WIDTH_METERS) * 1024).toBeCloseTo(50.6, 1)
  })

  it('keeps metres isotropic on non-square images', () => {
    const m = mapMetric(100, 0.5) // image twice as wide as tall
    expect(distanceMeters({ x: 0, y: 0 }, { x: 10000, y: 0 }, m)).toBeCloseTo(100)
    expect(distanceMeters({ x: 0, y: 0 }, { x: 0, y: 10000 }, m)).toBeCloseTo(50)
  })

  it('measures polylines', () => {
    const m = mapMetric(100)
    expect(polylineLength([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }], m)).toBeCloseTo(7)
    expect(polylineLength([{ x: 5, y: 5 }], m)).toBe(0)
  })
})

describe('polygons', () => {
  const square = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 200, y: 200 },
    { x: 100, y: 200 },
  ]

  it('detects points inside an automatically closed polygon', () => {
    expect(pointInPolygon({ x: 150, y: 150 }, square)).toBe(true)
    expect(pointInPolygon({ x: 250, y: 150 }, square)).toBe(false)
    // concave "C" shape: the notch is outside
    const c = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 200 },
      { x: 300, y: 200 },
      { x: 300, y: 300 },
      { x: 0, y: 300 },
    ]
    expect(pointInPolygon({ x: 200, y: 150 }, c)).toBe(false)
    expect(pointInPolygon({ x: 50, y: 150 }, c)).toBe(true)
  })

  it('computes areas in screen units', () => {
    expect(polygonArea(square)).toBe(10000)
    expect(polygonArea(square, { x: 0.5, y: 0.5 })).toBe(2500)
  })
})

describe('paths', () => {
  it('simplifies nearly straight strokes but keeps corners', () => {
    const stroke = [
      { x: 0, y: 0 },
      { x: 10, y: 0.3 },
      { x: 20, y: -0.2 },
      { x: 30, y: 0 },
      { x: 30, y: 10 },
      { x: 30.2, y: 20 },
    ]
    expect(simplifyPath(stroke, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30.2, y: 20 },
    ])
  })

  it('measures the distance from a point to a polyline in screen pixels', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]
    expect(distanceToPolyline({ x: 50, y: 10 }, line, { x: 0.5, y: 0.5 })).toBeCloseTo(5)
    expect(distanceToPolyline({ x: 130, y: 40 }, line, { x: 1, y: 1 })).toBeCloseTo(50)
  })

  it('finds the point halfway along a path', () => {
    const m = mapMetric(100)
    expect(pointAlong([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 0.5, m)).toEqual({ x: 100, y: 0 })
  })

  it('names route versions by their order unless renamed', () => {
    expect(routeName({ name: '' }, 0)).toBe('版本1')
    expect(routeName({ name: '  A 小 ' }, 3)).toBe('A 小')
  })

  it('sanitizes stored landings and paths', () => {
    expect(sanitizeLanding(undefined)).toBeNull()
    expect(sanitizeLanding({ x: 10.4, y: 20000, delay: '1.26' })).toEqual({ x: 10, y: 10000, delay: 1.3 })
    expect(sanitizeLanding({ x: 1, y: 2, delay: -3 })).toEqual({ x: 1, y: 2, delay: null })
    const paths = sanitizePaths([
      { id: 'a', name: 'x', mode: 'knife', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
      { id: 'b', points: [{ x: 1, y: 1 }] },
      { id: 'a', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, 'bad'] },
      'junk',
    ])
    expect(paths).toHaveLength(2)
    // 旧数据里路径的名称不再保存
    expect(paths[0]).toEqual({ id: 'a', mode: 'knife', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] })
    expect(paths[1]!.id).not.toBe('a')
    expect(paths[1]!.points).toHaveLength(2)
    expect(sanitizePaths(null)).toEqual([])
  })

  it('sanitizes route versions and converts legacy paths', () => {
    const line = [{ x: 1, y: 1 }, { x: 2, y: 2 }]
    const routes = sanitizeRoutes([
      { id: 'r1', name: '  快 ', paths: [{ id: 'p', mode: 'knife', points: line }] },
      { id: 'r2', name: 'empty', paths: [] },
      { id: 'r1', name: 'x'.repeat(40), paths: [{ id: 'q', mode: 'walk', points: line }] },
      'junk',
    ])
    expect(routes.map((r) => r.name)).toEqual(['快', 'x'.repeat(20)])
    expect(routes[1]!.id).not.toBe('r1')
    // 旧版本只有一组路径：转成一个未命名的版本
    expect(sanitizeRoutes(undefined, [{ id: 'p', mode: 'knife', points: line }])).toEqual([
      { id: 'route_1', name: '', paths: [{ id: 'p', mode: 'knife', points: line }] },
    ])
    expect(sanitizeRoutes(undefined, undefined)).toEqual([])
  })

  it('normalizes landing delays', () => {
    expect(normalizeDelay('')).toBeNull()
    expect(normalizeDelay('2.34')).toBe(2.3)
    expect(normalizeDelay(0)).toBe(0)
    expect(normalizeDelay(999)).toBe(60)
    expect(normalizeDelay('abc')).toBeNull()
  })
})
