import { describe, expect, it } from 'vitest'
import { createPathEditor } from '@/composables/usePathEditor'
import { pathName } from '@/lib/paths'

const line = (x: number) => [
  { x, y: 0 },
  { x: x + 100, y: 0 },
]

describe('path editor', () => {
  it('fills the pending path info before drawing and selects each new path', () => {
    const ed = createPathEditor()
    ed.start([])
    expect(ed.selectedId).toBeNull()
    expect(ed.pendingOrder).toBe(1)
    ed.setMode(null, 'knife')
    const a = ed.addStroke(line(0))
    expect(a.mode).toBe('knife')
    expect(ed.selectedId).toBe(a.id)
    const b = ed.addStroke(line(100))
    expect(b.mode).toBe('')
    expect(ed.paths.map((p) => p.id)).toEqual([a.id, b.id])
    expect(ed.dirty).toBe(true)
  })

  it('keeps order numbers unique by swapping', () => {
    const ed = createPathEditor()
    ed.start([])
    const a = ed.addStroke(line(0))
    const b = ed.addStroke(line(100))
    const c = ed.addStroke(line(200))
    ed.setOrder(c.id, 1)
    expect(ed.paths.map((p) => p.id)).toEqual([c.id, b.id, a.id])
    // out of range is ignored
    ed.setOrder(a.id, 4)
    expect(ed.paths.map((p) => p.id)).toEqual([c.id, b.id, a.id])
  })

  it('treats the default name as unnamed so it follows the order', () => {
    const ed = createPathEditor()
    ed.start([])
    const a = ed.addStroke(line(0))
    const b = ed.addStroke(line(100))
    ed.setName(a.id, '路径1')
    ed.setName(b.id, '  转点 ')
    expect(ed.paths[0]!.name).toBe('')
    expect(ed.paths[1]!.name).toBe('转点')
    ed.setOrder(a.id, 2)
    expect(ed.paths.map((p, i) => pathName(p, i))).toEqual(['转点', '路径2'])
  })

  it('redraws the latest path: goes back to the previous one and reuses the info', () => {
    const ed = createPathEditor()
    ed.start([])
    const a = ed.addStroke(line(0))
    ed.setMode(a.id, 'knife')
    const b = ed.addStroke(line(100))
    ed.setMode(b.id, 'walk')
    ed.setName(b.id, '静步进点')
    ed.redraw()
    expect(ed.paths.map((p) => p.id)).toEqual([a.id])
    expect(ed.selectedId).toBe(a.id)
    const again = ed.addStroke(line(300))
    expect(again).toMatchObject({ name: '静步进点', mode: 'walk' })
    expect(ed.paths.map((p) => p.id)).toEqual([a.id, again.id])
  })

  it('stays on the pending path when the first path is redrawn', () => {
    const ed = createPathEditor()
    ed.start([])
    ed.setMode(null, 'odin')
    const a = ed.addStroke(line(0))
    const b = ed.addStroke(line(100))
    ed.select(a.id)
    ed.redraw()
    expect(ed.selectedId).toBeNull()
    expect(ed.pending).toMatchObject({ mode: 'odin', insertAt: 0 })
    expect(ed.pendingOrder).toBe(1)
    const redrawn = ed.addStroke(line(500))
    expect(ed.paths.map((p) => p.id)).toEqual([redrawn.id, b.id])
    expect(redrawn.mode).toBe('odin')
  })

  it('does nothing when redrawing without a drawn path', () => {
    const ed = createPathEditor()
    ed.start([])
    ed.setName(null, '起步')
    ed.redraw()
    expect(ed.pending.name).toBe('起步')
    expect(ed.paths).toHaveLength(0)
  })

  it('validates before finishing', () => {
    const ed = createPathEditor()
    ed.start([])
    expect(ed.validate()).toBe('请先在地图上画出路径')
    const a = ed.addStroke(line(0))
    ed.setMode(a.id, 'knife')
    const b = ed.addStroke(line(100))
    ed.select(a.id)
    expect(ed.validate()).toBe('请为「路径2」选择行走方式')
    expect(ed.selectedId).toBe(b.id)
    ed.setMode(b.id, 'walk')
    expect(ed.validate()).toBeNull()
    expect(ed.result()).toHaveLength(2)
  })

  it('loads existing paths and allows removing all of them', () => {
    const ed = createPathEditor()
    ed.start([{ id: 'p1', name: '', mode: 'knife', points: line(0) }], 'p1')
    expect(ed.selectedId).toBe('p1')
    expect(ed.dirty).toBe(false)
    ed.remove('p1')
    expect(ed.selectedId).toBeNull()
    expect(ed.dirty).toBe(true)
    expect(ed.validate()).toBeNull()
  })
})
