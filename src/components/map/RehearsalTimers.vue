<script setup lang="ts">
import { computed } from 'vue'
import { formatClock, SPIKE_SECONDS } from '@/lib/rehearsal'
import Icon from '@/components/common/Icon.vue'

/**
 * 现场演练的计时器：正向计时（精确到 0.1 秒）+ 下方的 45 秒爆能器倒计时。
 * 两者都在圆点开始移动时开始，到达终点时暂停。
 */
const props = defineProps<{
  /** 圆点已经走了多少秒（到达终点后不再增加） */
  elapsed: number
}>()

const spike = computed(() => Math.max(0, SPIKE_SECONDS - props.elapsed))
</script>

<template>
  <div class="timers" role="timer" aria-label="现场演练计时">
    <div class="timer">
      <span class="label">
        <Icon name="timer" :size="13" />
        计时
      </span>
      <span class="value tabular">{{ formatClock(elapsed) }}<small>s</small></span>
    </div>
    <div class="timer spike" :class="{ low: spike <= 10, zero: spike <= 0 }">
      <span class="label">
        <Icon name="spike" :size="13" />
        爆能器
      </span>
      <span class="value tabular">{{ formatClock(spike, 'ceil') }}<small>s</small></span>
    </div>
  </div>
</template>

<style scoped>
.timers {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 136px;
}
.timer {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 12px 7px;
  border: 1px solid var(--line-strong);
  border-left: 3px solid var(--cyan-dim);
  border-radius: var(--r-lg);
  background: rgb(13 20 25 / 0.88);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-card);
}
.label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-2);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.timer .label :deep(.icon) {
  color: var(--cyan);
}
.value {
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: 0.02em;
}
.value small {
  margin-left: 2px;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 700;
}
.spike {
  border-left-color: var(--accent);
}
.spike .label :deep(.icon) {
  color: var(--accent);
}
.spike.low .value {
  color: #ff7b86;
}
.spike.zero .value {
  color: var(--accent);
}
</style>
