import { describe, expect, it } from 'vitest'
import { createPathEditor } from '@/composables/usePathEditor'

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

  it('names the route version; the default name counts as unnamed', () => {
    const ed = createPathEditor()
    ed.start([], null, { index: 1 })
    expect(ed.title).toBe('版本2')
    ed.setName('版本2')
    expect(ed.name).toBe('')
    ed.setName('  快速转点 ')
    expect(ed.name).toBe('快速转点')
    expect(ed.title).toBe('快速转点')
    expect(ed.dirty).toBe(true)
    ed.setName('x'.repeat(40))
    expect(ed.name).toHaveLength(20)
  })

  it('loads the version name and tracks renames as changes', () => {
    const ed = createPathEditor()
    ed.start([{ id: 'p1', mode: 'knife', points: line(0) }], null, { name: ' 默认 ', index: 0 })
    expect(ed.name).toBe('默认')
    expect(ed.dirty).toBe(false)
    ed.setName('新名字')
    expect(ed.dirty).toBe(true)
    ed.setName('默认')
    expect(ed.dirty).toBe(false)
  })

  it('redraws the latest path: goes back to the previous one and reuses the info', () => {
    const ed = createPathEditor()
    ed.start([])
    const a = ed.addStroke(line(0))
    ed.setMode(a.id, 'knife')
    const b = ed.addStroke(line(100))
    ed.setMode(b.id, 'walk')
    ed.redraw()
    expect(ed.paths.map((p) => p.id)).toEqual([a.id])
    expect(ed.selectedId).toBe(a.id)
    const again = ed.addStroke(line(300))
    expect(again).toMatchObject({ mode: 'walk' })
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
    ed.setMode(null, 'walk')
    ed.redraw()
    expect(ed.pending.mode).toBe('walk')
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
    expect(ed.validate()).toBe('请为第 2 段路径选择行走方式')
    expect(ed.selectedId).toBe(b.id)
    ed.setMode(b.id, 'walk')
    expect(ed.validate()).toBeNull()
    expect(ed.result()).toHaveLength(2)
  })

  it('loads existing paths and allows removing all of them', () => {
    const ed = createPathEditor()
    ed.start([{ id: 'p1', mode: 'knife', points: line(0) }], 'p1')
    expect(ed.selectedId).toBe('p1')
    expect(ed.dirty).toBe(false)
    ed.remove('p1')
    expect(ed.selectedId).toBeNull()
    expect(ed.dirty).toBe(true)
    expect(ed.validate()).toBeNull()
  })
})
