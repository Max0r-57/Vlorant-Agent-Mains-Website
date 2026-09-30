<script setup lang="ts">
/** 现场演练中移动的圆点：白色圆心 + 青蓝色外圈（用 at(pos) 定位） */
defineProps<{ moving?: boolean }>()
</script>

<template>
  <span class="dot" :class="{ moving }" aria-hidden="true" />
</template>

<style scoped>
.dot {
  position: absolute;
  z-index: 6;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow:
    0 0 0 3px var(--cyan),
    0 0 14px 3px rgb(120 251 231 / 0.55),
    0 2px 6px rgb(0 0 0 / 0.6);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.dot.moving::after {
  content: '';
  position: absolute;
  inset: -6px;
  border: 2px solid var(--cyan);
  border-radius: 50%;
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
