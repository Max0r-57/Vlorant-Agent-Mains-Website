import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import {
  annotationBounds,
  arrowGeometry,
  hitTest,
  levelOf,
  plainAnnotations,
  sanitizeAnnotations,
  strokeSize,
  textBackground,
  textSize,
  translateAnnotation,
} from '@/lib/annotations'
import { formatDuration, formatMediaCount } from '@/lib/format'
import type { Annotation } from '@/types'

const pen: Annotation = { id: 'p', type: 'pen', color: '#ff4655', size: 10, points: [0, 0, 100, 0, 100, 100] }
const circle: Annotation = { id: 'c', type: 'ellipse', color: '#ffd23f', size: 6, x: 200, y: 200, w: 100, h: 60 }
const arrow: Annotation = { id: 'a', type: 'arrow', color: '#3d9bff', size: 8, x1: 400, y1: 400, x2: 600, y2: 400 }
const text: Annotation = { id: 't', type: 'text', color: '#ffffff', size: 40, x: 700, y: 50, text: '站这里' }

describe('annotations', () => {
  it('scales stroke and text sizes with the image', () => {
    expect(strokeSize(2, 1920, 1080)).toBeCloseTo(12.5, 1)
    expect(strokeSize(2, 960, 540)).toBeCloseTo(6.2, 1)
    expect(strokeSize(1, 100, 100)).toBe(1.5)
    expect(textSize(3, 1920, 1080)).toBe(96)
    expect(levelOf({ ...pen, size: strokeSize(3, 1920, 1080) }, 1920, 1080)).toBe(3)
    expect(levelOf({ ...text, size: textSize(1, 1920, 1080) }, 1920, 1080)).toBe(1)
  })

  it('hits the topmost annotation under the pointer', () => {
    const list = [pen, circle, arrow, text]
    expect(hitTest(list, { x: 50, y: 3 }, 2)?.id).toBe('p')
    expect(hitTest(list, { x: 50, y: 30 }, 2)).toBeNull()
    // 圆圈内部也能选中
    expect(hitTest(list, { x: 250, y: 230 }, 2)?.id).toBe('c')
    expect(hitTest(list, { x: 500, y: 405 }, 2)?.id).toBe('a')
    expect(hitTest(list, { x: 720, y: 70 }, 2)?.id).toBe('t')
    // 重叠时上面的优先
    const covering: Annotation = { ...circle, id: 'top', x: 0, y: -20, w: 120, h: 60 }
    expect(hitTest([pen, covering], { x: 50, y: 0 }, 2)?.id).toBe('top')
  })

  it('moves annotations and reports their bounds', () => {
    expect(translateAnnotation(pen, 10, 5)).toMatchObject({ points: [10, 5, 110, 5, 110, 105] })
    expect(translateAnnotation(arrow, -10, 0)).toMatchObject({ x1: 390, x2: 590 })
    expect(translateAnnotation(circle, 1, 2)).toMatchObject({ x: 201, y: 202, w: 100 })
    expect(annotationBounds(pen)).toEqual({ x: -5, y: -5, w: 110, h: 110 })
    expect(annotationBounds(circle)).toEqual({ x: 197, y: 197, w: 106, h: 66 })
    const b = annotationBounds(text)
    expect(b.x).toBe(700)
    expect(b.w).toBeGreaterThan(40 * 3)
  })

  it('draws the arrow head at the tip', () => {
    const g = arrowGeometry(arrow)
    expect(g.head[0]).toEqual({ x: 600, y: 400 })
    expect(g.shaftEnd.x).toBeLessThan(600)
    expect(g.head[1]!.x).toBeCloseTo(g.head[2]!.x)
    expect(g.head[1]!.y + g.head[2]!.y).toBeCloseTo(800)
  })

  it('picks a readable background for text', () => {
    expect(textBackground('#16191d')).toContain('255, 255, 255')
    expect(textBackground('#ffffff')).toContain('8, 12, 16')
  })

  it('sanitizes annotations from backups', () => {
    const raw = [
      pen,
      { ...circle, w: -5 },
      { type: 'pen', points: [1, 2, 3] },
      { type: 'text', x: 1, y: 2, text: '   ' },
      { type: 'arrow', x1: 0, y1: 0, x2: 1, y2: 'x' },
      { type: 'unknown' },
      null,
      { ...text, color: 'red', size: -1, text: 'a'.repeat(900) },
    ]
    const out = sanitizeAnnotations(raw)
    expect(out.map((a) => a.type)).toEqual(['pen', 'text'])
    expect(out[1]).toMatchObject({ color: '#ff4655', size: 4 })
    expect((out[1] as Extract<Annotation, { type: 'text' }>).text).toHaveLength(500)
    expect(sanitizeAnnotations('nope')).toEqual([])
  })

  it('copies reactive annotations into plain objects', () => {
    const list = reactive([pen, text]) as Annotation[]
    const plain = plainAnnotations(list)
    expect(plain).toEqual([pen, text])
    expect(structuredClone(plain)).toEqual([pen, text])
  })
})

describe('media formatting', () => {
  it('formats durations and media counts', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(12.4)).toBe('0:12')
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(3723)).toBe('1:02:03')
    expect(formatMediaCount(3, 0)).toBe('3 张图片')
    expect(formatMediaCount(0, 2)).toBe('2 个视频')
    expect(formatMediaCount(2, 1)).toBe('2 张图片、1 个视频')
    expect(formatMediaCount(0, 0)).toBe('0 张图片')
  })
})
