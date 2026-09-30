<script setup lang="ts">
import { computed } from 'vue'
import type { Position } from '@/types'

/** 圈画搜索圈出的范围（放在 MapCanvas 的默认插槽里）：画的时候是虚线，画完后闭合并填充 */
const props = defineProps<{
  points: readonly Position[]
  px: (pos: Position) => { x: number; y: number }
  size: { w: number; h: number }
  closed?: boolean
}>()

const attr = computed(() =>
  props.points
    .map((p) => props.px(p))
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' '),
)
</script>

<template>
  <svg class="area-layer" :width="size.w" :height="size.h" aria-hidden="true">
    <polygon v-if="closed" class="shape" :points="attr" />
    <polyline v-else class="shape open" :points="attr" />
  </svg>
</template>

<style scoped>
.area-layer {
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
  pointer-events: none;
}
.shape {
  fill: rgb(120 251 231 / 0.08);
  stroke: var(--cyan);
  stroke-width: 2;
  stroke-dasharray: 8 6;
  stroke-linejoin: round;
  stroke-linecap: round;
  filter: drop-shadow(0 0 3px rgb(0 0 0 / 0.7));
}
.shape.open {
  fill: rgb(120 251 231 / 0.05);
  animation: march 0.8s linear infinite;
}
@keyframes march {
  to {
    stroke-dashoffset: -28;
  }
}
</style>
