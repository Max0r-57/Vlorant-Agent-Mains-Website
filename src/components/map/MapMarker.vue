<script setup lang="ts">
/**
 * 地图标记点
 *  single        实心圆点 + 白色外圈，圆心颜色 = 类型颜色
 *  stack         同一位置有多个 Lineup：黑色圆心 + 白色外圈，中间显示数量
 *  active        详情页当前 Lineup：黄色圆心
 *  active-stack  详情页当前 Lineup 位于多个 Lineup 的位置：黑色圆心 + 黄色外圈
 *  pending       正在新建的位置
 */
export type MarkerVariant = 'single' | 'stack' | 'active' | 'active-stack' | 'pending'

withDefaults(
  defineProps<{
    variant: MarkerVariant
    color?: string
    count?: number
    size?: number
    /** 闪烁提示（从搜索结果定位时） */
    highlight?: boolean
    /** 拖动时将要吸附合并的目标 */
    snapTarget?: boolean
    /** 当前打开了预览窗口 */
    selected?: boolean
    /** 选中的 Lineup：外面加一圈青色光环 */
    ring?: boolean
    dragging?: boolean
    label?: string
  }>(),
  { color: '#94a3b8', count: 1, size: 16 },
)
</script>

<template>
  <button
    type="button"
    class="marker"
    data-marker
    :class="[variant, { highlight, snap: snapTarget, selected, dragging }]"
    :style="{ '--c': color, '--d': `${variant === 'stack' || variant === 'active-stack' ? size + 4 : size}px` }"
    :aria-label="label"
  >
    <span v-if="ring" class="ring" />
    <span class="core">
      <span v-if="(variant === 'stack' || variant === 'active-stack') && count > 1" class="count">
        {{ count > 99 ? '99+' : count }}
      </span>
    </span>
  </button>
</template>

<style scoped>
.marker {
  position: absolute;
  width: var(--d);
  height: var(--d);
  padding: 0;
  border: 0;
  background: none;
  transform: translate(-50%, -50%);
  pointer-events: auto;
  cursor: pointer;
  touch-action: none;
}
/* 扩大可点击区域 */
.marker::before {
  content: '';
  position: absolute;
  inset: -7px;
  border-radius: 50%;
}
.core {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: var(--c);
  box-shadow:
    0 0 0 2.5px #fff,
    0 2px 8px rgb(0 0 0 / 0.65);
  transition:
    transform 0.14s var(--ease),
    box-shadow 0.14s var(--ease);
}
.marker:hover .core,
.marker:focus-visible .core,
.marker.selected .core {
  transform: scale(1.22);
}
.marker:focus-visible {
  outline: none;
}
.marker:focus-visible .core {
  box-shadow:
    0 0 0 2.5px #fff,
    0 0 0 5px var(--cyan);
}

.stack .core,
.active-stack .core {
  background: #05080b;
}
.count {
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.active .core {
  background: var(--gold);
}
.active-stack .core {
  box-shadow:
    0 0 0 3px var(--gold),
    0 2px 8px rgb(0 0 0 / 0.65);
}
.active,
.active-stack {
  z-index: 3;
  cursor: grab;
}
.active.dragging,
.active-stack.dragging {
  cursor: grabbing;
}
.active.dragging .core {
  transform: scale(1.3);
  box-shadow:
    0 0 0 2.5px #fff,
    0 8px 18px rgb(0 0 0 / 0.6);
}
/* 当前 Lineup 的光圈 */
.active::after,
.active-stack::after {
  content: '';
  position: absolute;
  inset: -9px;
  border: 2px solid var(--gold);
  border-radius: 50%;
  opacity: 0.6;
  animation: breathe 1.8s ease-in-out infinite;
  pointer-events: none;
}
.active.dragging::after {
  display: none;
}

.pending {
  z-index: 4;
  cursor: default;
}
.pending .core {
  background: var(--c);
}
.pending::after {
  content: '';
  position: absolute;
  inset: -4px;
  border: 2px solid #fff;
  border-radius: 50%;
  animation: ripple 1.4s ease-out infinite;
  pointer-events: none;
}

/* 选中：青色光环 */
.ring {
  position: absolute;
  inset: -7px;
  border: 2px solid var(--cyan);
  border-radius: 50%;
  box-shadow:
    0 0 10px rgb(120 251 231 / 0.55),
    inset 0 0 6px rgb(120 251 231 / 0.35);
  pointer-events: none;
}

/* 吸附目标：放大 + 黄色光晕 */
.snap .core {
  transform: scale(1.45);
  box-shadow:
    0 0 0 2.5px #fff,
    0 0 0 7px rgb(255 210 63 / 0.55),
    0 2px 10px rgb(0 0 0 / 0.6);
}

.highlight::after {
  content: '';
  position: absolute;
  inset: -4px;
  border: 3px solid var(--cyan);
  border-radius: 50%;
  animation: ripple 0.9s ease-out 3;
  pointer-events: none;
}

@keyframes ripple {
  from {
    transform: scale(1);
    opacity: 0.9;
  }
  to {
    transform: scale(2.6);
    opacity: 0;
  }
}
@keyframes breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.65;
  }
  50% {
    transform: scale(1.25);
    opacity: 0.2;
  }
}
</style>
