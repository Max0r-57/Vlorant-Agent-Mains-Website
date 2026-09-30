import { computed, onBeforeUnmount, reactive, ref, shallowRef } from 'vue'
import { landingSpec, type LandingSpec } from '@/data/landing'
import type { MapMetric } from '@/lib/geometry'
import { buildRoute, landingPhase, positionOnRoute, type Route } from '@/lib/rehearsal'
import type { Landing, LineupPath } from '@/types'

export interface RehearsalInput {
  paths: readonly LineupPath[]
  landing: Landing | null
  agentId: string
  metric: MapMetric
  /** 开始移动前停顿的秒数（等地图移动到位） */
  leadIn?: number
}

/**
 * 现场演练的时钟：圆点按行走方式的速度沿路径移动，同时驱动正向计时、爆能器倒计时和落点倒计时。
 * 演练结束后停在结束状态，直到重新开始或退出。
 */
export function useRehearsal() {
  const active = ref(false)
  /** 从圆点开始移动算起的秒数（停顿阶段为 0） */
  const elapsed = ref(0)
  const route = shallowRef<Route | null>(null)
  const landing = shallowRef<Landing | null>(null)
  const spec = shallowRef<LandingSpec | undefined>(undefined)
  let startAt = 0
  let raf = 0
  let leadIn = 0

  const duration = computed(() => route.value?.duration ?? 0)
  /** 有技能范围和持续时间的英雄才做落点倒计时（目前只有炼狱） */
  const hasCountdown = computed(() => !!landing.value && !!spec.value)
  const landingEnd = computed(() =>
    hasCountdown.value ? (landing.value!.delay ?? 0) + spec.value!.duration : 0,
  )
  const endTime = computed(() => Math.max(duration.value, landingEnd.value))
  /** 正向计时 / 爆能器倒计时：圆点到达终点时停住 */
  const travel = computed(() => Math.min(elapsed.value, duration.value))
  const moving = computed(() => active.value && elapsed.value > 0 && elapsed.value < duration.value)
  const finished = computed(() => active.value && elapsed.value >= endTime.value)
  const dot = computed(() => (route.value ? (positionOnRoute(route.value, elapsed.value)?.pos ?? null) : null))
  const landingState = computed(() =>
    hasCountdown.value ? landingPhase(elapsed.value, landing.value!.delay ?? 0, spec.value!.duration) : null,
  )

  function tick(now: number) {
    const t = (now - startAt) / 1000 - leadIn
    elapsed.value = Math.min(endTime.value, Math.max(0, t))
    if (t < endTime.value) raf = requestAnimationFrame(tick)
  }

  function restart(pause = 0.35) {
    cancelAnimationFrame(raf)
    leadIn = pause
    elapsed.value = 0
    startAt = performance.now()
    raf = requestAnimationFrame(tick)
  }

  function start(input: RehearsalInput) {
    route.value = buildRoute(input.paths, input.metric)
    landing.value = input.landing ? { ...input.landing } : null
    spec.value = landingSpec(input.agentId)
    active.value = true
    restart(input.leadIn ?? 0.35)
  }

  function stop() {
    cancelAnimationFrame(raf)
    active.value = false
    route.value = null
    landing.value = null
    spec.value = undefined
    elapsed.value = 0
  }

  onBeforeUnmount(() => cancelAnimationFrame(raf))

  return reactive({
    active,
    elapsed,
    duration,
    travel,
    moving,
    finished,
    dot,
    landing,
    spec,
    hasCountdown,
    landingState,
    start,
    restart,
    stop,
  })
}
