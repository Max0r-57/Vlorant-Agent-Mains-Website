import { shallowRef } from 'vue'
import { distanceToPolyline, roundPos, simplifyPath, type AxisScale } from '@/lib/geometry'
import type { Position } from '@/types'
import type { PathEditor } from './usePathEditor'

/** 吸附距离（屏幕像素） */
const SNAP_PX = 16
/** 点击选中路径的距离（屏幕像素） */
const PICK_PX = 10

interface DrawPayload {
  pos: Position
}

function screenDist(a: Position, b: Position, s: AxisScale) {
  return Math.hypot((a.x - b.x) * s.x, (a.y - b.y) * s.y)
}

function nearest(pos: Position, targets: readonly Position[], s: AxisScale, maxPx = SNAP_PX) {
  let best: Position | null = null
  let bestD = maxPx
  for (const t of targets) {
    const d = screenDist(pos, t, s)
    if (d <= bestD) {
      best = t
      bestD = d
    }
  }
  return best
}

/**
 * 收集画笔的轨迹点（相邻点至少相隔 2 像素）。
 * 每加一个点都换成新数组：地图上的轨迹图层靠数组引用变化来重新绘制，拖动途中就能看到画出的线。
 */
export function useStroke(scale: () => AxisScale | undefined) {
  const points = shallowRef<Position[] | null>(null)

  function begin(pos: Position) {
    points.value = [pos]
  }

  function add(pos: Position) {
    const pts = points.value
    const s = scale()
    if (!pts || !s) return
    if (screenDist(pts[pts.length - 1]!, pos, s) < 2) return
    points.value = [...pts, pos]
  }

  function finish() {
    const pts = points.value
    points.value = null
    return pts
  }

  function cancel() {
    points.value = null
  }

  return { points, begin, add, finish, cancel }
}

/**
 * 在地图上画路径（首页新建和详情页共用），配合 MapCanvas 的画笔事件使用：
 * - 起点可以吸附到 Lineup 位置和已有路径的终点，画完一条可以接着从它的终点继续画；
 * - 终点可以吸附到 Lineup 位置和已有路径的起点；
 * - 单击路径选中它，编辑它的信息。
 */
export function usePathDrawing(opts: {
  editor: PathEditor
  /** 每个坐标单位对应的屏幕像素（MapCanvas.pxPerUnit） */
  scale: () => AxisScale | undefined
  /** 其他可以吸附的点（例如 Lineup 位置） */
  anchors: () => Position[]
}) {
  const stroke = useStroke(opts.scale)
  /** 当前会吸附到的点（显示提示圈） */
  const snapHint = shallowRef<Position | null>(null)

  function targets(kind: 'start' | 'end') {
    const list = [...opts.anchors()]
    for (const p of opts.editor.paths) {
      const q = kind === 'start' ? p.points[p.points.length - 1] : p.points[0]
      if (q) list.push(q)
    }
    return list
  }

  function snap(pos: Position, kind: 'start' | 'end') {
    const s = opts.scale()
    return s ? nearest(pos, targets(kind), s) : null
  }

  function onStart({ pos }: DrawPayload) {
    const start = snap(pos, 'start') ?? pos
    // 开始画下一条路径：编辑框切换到这条新路径
    opts.editor.select(null)
    stroke.begin({ ...start })
    snapHint.value = null
  }

  function onMove({ pos }: DrawPayload) {
    stroke.add(pos)
    snapHint.value = snap(pos, 'end')
  }

  function onEnd({ pos }: DrawPayload) {
    stroke.add(pos)
    const raw = stroke.finish()
    snapHint.value = null
    const s = opts.scale()
    if (!raw || !s) return
    const end = snap(pos, 'end')
    if (end) raw[raw.length - 1] = { ...end }
    const pts = simplifyPath(raw, 1, s).map(roundPos)
    const dedup = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1]!.x || p.y !== pts[i - 1]!.y)
    let length = 0
    for (let i = 1; i < dedup.length; i++) length += screenDist(dedup[i - 1]!, dedup[i]!, s)
    // 太短的线当作误触
    if (dedup.length < 2 || length < 8) return
    opts.editor.addStroke(dedup)
  }

  function onCancel() {
    stroke.cancel()
    snapHint.value = null
  }

  /** 单击：选中附近的路径；返回是否选中了路径 */
  function onTap({ pos }: DrawPayload) {
    const s = opts.scale()
    if (!s) return false
    const hit = pickPathAt(opts.editor.paths, pos, s)
    if (hit) opts.editor.select(hit)
    return !!hit
  }

  function onHover(payload: DrawPayload | null) {
    snapHint.value = payload ? snap(payload.pos, 'start') : null
  }

  return {
    stroke: stroke.points,
    snapHint,
    onStart,
    onMove,
    onEnd,
    onCancel,
    onTap,
    onHover,
  }
}

/** 找到离 pos 最近的路径（屏幕距离不超过 maxPx），用于在非编辑状态下点击路径 */
export function pickPathAt(
  paths: readonly { id: string; points: readonly Position[] }[],
  pos: Position,
  scale: AxisScale,
  maxPx = PICK_PX,
) {
  let best: string | null = null
  let bestD = maxPx
  for (const p of paths) {
    const d = distanceToPolyline(pos, p.points, scale)
    if (d <= bestD) {
      best = p.id
      bestD = d
    }
  }
  return best
}
