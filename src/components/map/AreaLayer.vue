<script setup lang="ts">
import { computed } from 'vue'
import type { Position } from '@/types'

/**
 * 圈画搜索圈出的范围（放在 MapCanvas 的默认插槽里）。
 * 画的时候：实线显示鼠标经过的轨迹，笔尖有个小圆点，笔尖到起点之间的淡虚线是松手后会自动闭合的边；
 * 画完后：闭合成虚线框并填充。
 */
const props = defineProps<{
  points: readonly Position[]
  px: (pos: Position) => { x: number; y: number }
  size: { w: number; h: number }
  closed?: boolean
}>()

const screen = computed(() => props.points.map((p) => props.px(p)))

const attr = computed(() => screen.value.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '))

const first = computed(() => screen.value[0] ?? null)
const tip = computed(() => (screen.value.length > 1 ? screen.value[screen.value.length - 1]! : null))
</script>

<template>
  <svg class="area-layer" :width="size.w" :height="size.h" aria-hidden="true">
    <polygon v-if="closed" class="shape" :points="attr" />
    <g v-else class="drawing">
      <polygon v-if="tip" class="fill" :points="attr" />
      <line v-if="tip && first" class="closing" :x1="tip.x" :y1="tip.y" :x2="first.x" :y2="first.y" />
      <polyline class="casing" :points="attr" />
      <polyline class="trail" :points="attr" />
      <circle v-if="first" class="start" :cx="first.x" :cy="first.y" r="3.5" />
      <circle v-if="tip" class="tip" :cx="tip.x" :cy="tip.y" r="5" />
    </g>
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
.drawing polyline {
  fill: none;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.fill {
  fill: rgb(120 251 231 / 0.06);
  stroke: none;
}
.casing {
  stroke: rgb(4 8 12 / 0.6);
  stroke-width: 5.5;
}
.trail {
  stroke: var(--cyan);
  stroke-width: 2.5;
  filter: drop-shadow(0 0 3px rgb(120 251 231 / 0.6));
}
.closing {
  stroke: var(--cyan);
  stroke-width: 1.5;
  stroke-dasharray: 5 5;
  opacity: 0.55;
}
.start {
  fill: var(--cyan);
  stroke: rgb(4 8 12 / 0.6);
  stroke-width: 1;
}
.tip {
  fill: #fff;
  stroke: var(--cyan);
  stroke-width: 2.5;
  filter: drop-shadow(0 0 4px rgb(120 251 231 / 0.9));
}
</style>
