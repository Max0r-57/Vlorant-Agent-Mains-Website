<script setup lang="ts">
import { computed } from 'vue'
import { formatClock, type LandingPhase } from '@/lib/rehearsal'

/**
 * 落点位置上的倒计时（用 at(pos) 定位，显示在落点上方）：
 * 先倒数落点时间（图案还没出现），落地后倒数技能持续时间，打开大招时接着倒数大招持续时间。
 */
const props = defineProps<{
  phase: LandingPhase
  remaining: number
  /** 技能名称，如「燃烧弹」 */
  label: string
  /** 大招名称，如「天基光束」 */
  ultLabel?: string
  /** 与落点中心的距离（像素），通常为范围半径 */
  offset: number
}>()

const TITLES: Record<LandingPhase, string> = { flight: '落点', active: '', ult: '', done: '已结束' }
const title = computed(() =>
  props.phase === 'active' ? props.label : props.phase === 'ult' ? (props.ultLabel ?? '大招') : TITLES[props.phase],
)
</script>

<template>
  <div class="landing-countdown" :class="phase" :style="{ '--offset': `${offset + 8}px` }" aria-live="off">
    <span class="label">{{ title }}</span>
    <span class="value tabular">{{ formatClock(remaining, 'ceil') }}</span>
  </div>
</template>

<style scoped>
.landing-countdown {
  position: absolute;
  z-index: 5;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 9px 4px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-lg);
  background: rgb(13 20 25 / 0.9);
  box-shadow: var(--shadow-card);
  color: var(--text);
  white-space: nowrap;
  transform: translate(-50%, calc(-100% - var(--offset)));
  pointer-events: none;
}
.label {
  color: var(--text-2);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
}
.value {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 800;
}
.flight {
  border-color: rgb(255 210 63 / 0.5);
}
.flight .value {
  color: var(--gold);
}
.active {
  border-color: rgb(255 77 46 / 0.65);
}
.active .value {
  color: #ff8a70;
}
.ult {
  border-color: rgb(255 176 46 / 0.7);
  box-shadow:
    var(--shadow-card),
    0 0 12px rgb(255 176 46 / 0.35);
}
.ult .value {
  color: #ffc35c;
}
.done {
  opacity: 0.7;
}
</style>
