<script setup lang="ts">
/**
 * 落点图案（放在 MapCanvas 的默认插槽里，用 at(pos) 定位）：
 * - 有技能范围时（炼狱燃烧弹）：按实际直径显示的半透明红色圆形，透过它能看到地图；
 * - 其他英雄：通用的落点标记。
 * 可拖动时由父组件处理 pointerdown。
 */
withDefaults(
  defineProps<{
    /** 范围直径（屏幕像素）；为空时显示通用落点标记 */
    diameter?: number | null
    color?: string
    draggable?: boolean
    dragging?: boolean
    /** 淡化显示（例如燃烧已经结束、或者只是预览） */
    dim?: boolean
    label?: string
  }>(),
  { diameter: null, color: '#ff4d2e', draggable: false, dragging: false, dim: false, label: '落点' },
)
</script>

<template>
  <div
    class="landing"
    :class="{ area: !!diameter, draggable, dragging, dim }"
    :style="{ '--c': color, '--d': diameter ? `${diameter}px` : undefined }"
    :data-marker="draggable ? '' : undefined"
    :role="draggable ? 'button' : undefined"
    :aria-label="label"
    :title="draggable ? '按住拖动摆放落点' : undefined"
  >
    <template v-if="diameter">
      <span class="fill" />
      <span class="center" />
    </template>
    <svg v-else class="target" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="9" />
      <path d="M13 1v6M13 19v6M1 13h6M19 13h6" />
      <circle class="dot" cx="13" cy="13" r="2.5" />
    </svg>
  </div>
</template>

<style scoped>
.landing {
  position: absolute;
  width: 26px;
  height: 26px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  touch-action: none;
  transition: opacity 0.25s var(--ease);
}
.landing.area {
  width: max(var(--d), 10px);
  height: max(var(--d), 10px);
}
.landing.draggable {
  pointer-events: auto;
  cursor: grab;
}
.landing.dragging {
  cursor: grabbing;
}
.landing.dim {
  opacity: 0.35;
}
.fill {
  position: absolute;
  inset: 0;
  border: 2px solid color-mix(in srgb, var(--c) 90%, #fff);
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--c) 40%, transparent) 0%,
    color-mix(in srgb, var(--c) 28%, transparent) 70%,
    color-mix(in srgb, var(--c) 36%, transparent) 100%
  );
  box-shadow:
    0 0 12px color-mix(in srgb, var(--c) 45%, transparent),
    inset 0 0 10px color-mix(in srgb, var(--c) 35%, transparent);
}
.draggable:hover .fill,
.dragging .fill {
  border-color: #fff;
}
.center {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 0 1.5px var(--c);
  transform: translate(-50%, -50%);
}
.target {
  display: block;
  overflow: visible;
  fill: none;
  stroke: var(--c);
  stroke-width: 2.2;
  stroke-linecap: round;
  filter: drop-shadow(0 0 1.5px rgb(0 0 0 / 0.9));
}
.target .dot {
  fill: #fff;
  stroke: var(--c);
  stroke-width: 1.5;
}
</style>
