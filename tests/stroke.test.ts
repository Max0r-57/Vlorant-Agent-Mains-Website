import { describe, expect, it } from 'vitest'
import { useStroke } from '@/composables/usePathDrawing'

describe('stroke', () => {
  it('replaces the points array on every added point so the trail redraws while dragging', () => {
    const stroke = useStroke(() => ({ x: 1, y: 1 }))
    stroke.begin({ x: 0, y: 0 })
    const first = stroke.points.value
    stroke.add({ x: 10, y: 0 })
    const second = stroke.points.value
    expect(second).not.toBe(first)
    expect(second).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ])
    // closer than 2 screen pixels to the last point: ignored, same array
    stroke.add({ x: 11, y: 0 })
    expect(stroke.points.value).toBe(second)
    expect(stroke.finish()).toHaveLength(2)
    expect(stroke.points.value).toBeNull()
  })

  it('measures the minimum spacing in screen pixels', () => {
    const stroke = useStroke(() => ({ x: 4, y: 4 }))
    stroke.begin({ x: 0, y: 0 })
    stroke.add({ x: 1, y: 0 })
    expect(stroke.points.value).toHaveLength(2)
    stroke.cancel()
    expect(stroke.points.value).toBeNull()
    // not started: add is a no-op
    stroke.add({ x: 5, y: 5 })
    expect(stroke.points.value).toBeNull()
  })
})
