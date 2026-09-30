import { FALLBACK_SPEED, moveSpeed } from '@/data/movement'
import type { LineupPath, Position } from '@/types'
import { distanceMeters, type MapMetric } from './geometry'

/**
 * 现场演练的时间线：按序号依次沿每条路径、以对应行走方式的速度移动。
 * 时间单位都是秒，距离单位是游戏内的米。
 */

/** 爆能器倒计时（秒） */
export const SPIKE_SECONDS = 45

export interface RouteLeg {
  pathId: string
  points: Position[]
  /** 每个点距离本段起点的累计距离（米） */
  cum: number[]
  /** 本段长度（米） */
  length: number
  /** 速度（米 / 秒） */
  speed: number
  /** 从演练开始到进入本段的时间（秒） */
  start: number
  duration: number
}

export interface Route {
  legs: RouteLeg[]
  /** 走完全部路径所需时间（秒） */
  duration: number
  /** 全部路径的总长度（米） */
  length: number
}

export function buildRoute(
  paths: readonly LineupPath[],
  metric: MapMetric,
  speedOf: (mode: string) => number = moveSpeed,
): Route {
  const legs: RouteLeg[] = []
  let t = 0
  let total = 0
  for (const p of paths) {
    if (!p.points.length) continue
    const cum = [0]
    for (let i = 1; i < p.points.length; i++) {
      cum.push(cum[i - 1]! + distanceMeters(p.points[i - 1]!, p.points[i]!, metric))
    }
    const length = cum[cum.length - 1]!
    const speed = speedOf(p.mode) > 0 ? speedOf(p.mode) : FALLBACK_SPEED
    const duration = length / speed
    legs.push({ pathId: p.id, points: p.points, cum, length, speed, start: t, duration })
    t += duration
    total += length
  }
  return { legs, duration: t, length: total }
}

function pointAtDistance(leg: RouteLeg, d: number): Position {
  const { points, cum } = leg
  if (d <= 0 || points.length === 1) return { ...points[0]! }
  if (d >= leg.length) return { ...points[points.length - 1]! }
  // 二分查找 d 所在的线段
  let lo = 0
  let hi = cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid]! <= d) lo = mid
    else hi = mid
  }
  const segLen = cum[hi]! - cum[lo]!
  const t = segLen > 0 ? (d - cum[lo]!) / segLen : 0
  const a = points[lo]!
  const b = points[hi]!
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** 演练开始 t 秒后圆点所在的位置；超过总时长时停在终点 */
export function positionOnRoute(route: Route, t: number): { pos: Position; legIndex: number } | null {
  const legs = route.legs
  if (!legs.length) return null
  const last = legs[legs.length - 1]!
  // 走完后精确停在终点（避免浮点误差）
  if (t >= route.duration) return { pos: { ...last.points[last.points.length - 1]! }, legIndex: legs.length - 1 }
  const time = Math.max(0, t)
  let index = legs.length - 1
  for (let i = 0; i < legs.length; i++) {
    if (time < legs[i]!.start + legs[i]!.duration) {
      index = i
      break
    }
  }
  const leg = legs[index]!
  return { pos: pointAtDistance(leg, (time - leg.start) * leg.speed), legIndex: index }
}

export type LandingPhase = 'flight' | 'active' | 'done'

/**
 * 落点倒计时：先倒数落点时间（delay，图案隐藏），落地后再倒数持续时间（duration）。
 * remaining 为当前阶段剩余的秒数。
 */
export function landingPhase(t: number, delay: number, duration: number): { phase: LandingPhase; remaining: number } {
  if (t < delay) return { phase: 'flight', remaining: delay - t }
  if (t < delay + duration) return { phase: 'active', remaining: delay + duration - t }
  return { phase: 'done', remaining: 0 }
}

/**
 * 计时显示，精确到 0.1 秒；一分钟以上显示为 m:ss.s。
 * 正向计时向下取整（0.0 起），倒计时向上取整（到 0 时才显示 0.0），和游戏里的计时习惯一致。
 */
export function formatClock(seconds: number, round: 'floor' | 'ceil' = 'floor') {
  const tenths = Math.max(0, round === 'floor' ? Math.floor(seconds * 10 + 1e-6) : Math.ceil(seconds * 10 - 1e-6))
  const s = tenths / 10
  if (s < 60) return s.toFixed(1)
  const m = Math.floor(tenths / 600)
  const rest = (tenths - m * 600) / 10
  return `${m}:${rest.toFixed(1).padStart(4, '0')}`
}

/** 预估时间的简短显示：约 8.2 秒 */
export function formatDuration(seconds: number) {
  if (seconds < 60) return `${(Math.round(seconds * 10) / 10).toFixed(1)} 秒`
  const m = Math.floor(seconds / 60)
  return `${m} 分 ${Math.round(seconds - m * 60)} 秒`
}
