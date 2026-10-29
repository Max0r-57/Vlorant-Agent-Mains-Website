<script setup lang="ts">
/**
 * 现场演练中移动的圆点：白色圆心 + 青蓝色外圈（用 at(pos) 定位）。
 * 用 SVG 画同心圆，在任何缩放比例和屏幕缩放下圆心都在正中间。
 */
defineProps<{ moving?: boolean }>()
</script>

<template>
  <svg class="dot" :class="{ moving }" width="40" height="40" viewBox="-20 -20 40 40" aria-hidden="true">
    <circle v-if="moving" class="pulse" r="10" />
    <circle class="glow" r="10" />
    <circle class="body" r="8.5" />
  </svg>
</template>

<style scoped>
.dot {
  position: absolute;
  z-index: 6;
  overflow: visible;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.glow {
  fill: rgb(120 251 231 / 0.25);
  filter: blur(4px);
}
.body {
  fill: #fff;
  stroke: var(--cyan);
  stroke-width: 3;
  filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.6));
}
.pulse {
  fill: none;
  stroke: var(--cyan);
  stroke-width: 2;
  transform-box: fill-box;
  transform-origin: center;
  animation: pulse 1s ease-out infinite;
}
@keyframes pulse {
  from {
    transform: scale(0.7);
    opacity: 0.9;
  }
  to {
    transform: scale(1.8);
    opacity: 0;
  }
}
</style>
