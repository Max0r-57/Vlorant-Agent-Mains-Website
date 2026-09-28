/**
 * 浮层定位：根据锚点矩形和浮层尺寸，算出不超出视口的位置。
 */
export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export type Placement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top' | 'bottom' | 'right' | 'left'

export interface FloatingResult {
  left: number
  top: number
  /** 实际放在锚点的哪一侧（空间不足时会翻转） */
  side: 'top' | 'bottom' | 'left' | 'right'
  /** 可用的最大高度 */
  maxHeight: number
}

export function computePosition(
  anchor: Rect,
  size: { width: number; height: number },
  placement: Placement,
  opts: { offset?: number; margin?: number; vw?: number; vh?: number } = {},
): FloatingResult {
  const offset = opts.offset ?? 6
  const margin = opts.margin ?? 8
  const vw = opts.vw ?? window.innerWidth
  const vh = opts.vh ?? window.innerHeight
  const clampX = (x: number) =>
    Math.min(Math.max(margin, x), Math.max(margin, vw - size.width - margin))
  const clampY = (y: number, h = size.height) =>
    Math.min(Math.max(margin, y), Math.max(margin, vh - h - margin))

  if (placement === 'right' || placement === 'left') {
    const spaceRight = vw - (anchor.left + anchor.width) - offset - margin
    const spaceLeft = anchor.left - offset - margin
    let side: 'left' | 'right' = placement
    if (side === 'right' && spaceRight < size.width && spaceLeft > spaceRight) side = 'left'
    else if (side === 'left' && spaceLeft < size.width && spaceRight > spaceLeft) side = 'right'
    const left =
      side === 'right' ? anchor.left + anchor.width + offset : anchor.left - offset - size.width
    // 垂直方向：让锚点落在浮层上部三分之一处，再限制在视口内
    const top = clampY(anchor.top + anchor.height / 2 - Math.min(size.height / 3, 140))
    return { left: clampX(left), top, side, maxHeight: vh - margin * 2 }
  }

  const spaceBelow = vh - (anchor.top + anchor.height) - offset - margin
  const spaceAbove = anchor.top - offset - margin
  const preferTop = placement === 'top' || placement === 'top-start'
  let above = preferTop
  if (preferTop && spaceAbove < size.height && spaceBelow > spaceAbove) above = false
  if (!preferTop && spaceBelow < size.height && spaceAbove > spaceBelow) above = true
  const maxHeight = Math.max(120, above ? spaceAbove : spaceBelow)
  const height = Math.min(size.height, maxHeight)
  const top = above ? anchor.top - offset - height : anchor.top + anchor.height + offset

  let left: number
  if (placement === 'top' || placement === 'bottom') {
    left = anchor.left + anchor.width / 2 - size.width / 2
  } else if (placement === 'bottom-end') {
    left = anchor.left + anchor.width - size.width
  } else {
    left = anchor.left
  }
  return { left: clampX(left), top, side: above ? 'top' : 'bottom', maxHeight }
}
