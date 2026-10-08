<script setup lang="ts">
import { computed } from 'vue'
import type { LineupPath, Position } from '@/types'

/**
 * 地图上的行走路径（放在 MapCanvas 的默认插槽里）：
 * 蓝色线条，终点为蓝色实心 + 白色外圈的圆点，路径中间标出序号。
 * 线宽和圆点不随地图缩放，始终保持同样大小。
 */
const props = withDefaults(
  defineProps<{
    paths: readonly LineupPath[]
    /** MapCanvas 插槽提供的坐标换算 */
    px: (pos: Position) => { x: number; y: number }
    size: { w: number; h: number }
    selectedId?: string | null
    /** edit：编辑中（标出序号和选中的路径）；view：正常显示；preview：淡一些的预览 */
    variant?: 'edit' | 'view' | 'preview'
    showNumbers?: boolean
    /** 正在画的线 */
    stroke?: readonly Position[] | null
    /** 标红（例如还没选择行走方式的路径） */
    invalidIds?: readonly string[]
  }>(),
  { selectedId: null, variant: 'view', showNumbers: false, stroke: null, invalidIds: () => [] },
)

function toPoints(points: readonly Position[]) {
  return points.map((p) => props.px(p))
}

function attr(points: { x: number; y: number }[]) {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
}

/** 沿折线一半长度处的点（屏幕坐标） */
function midpoint(points: { x: number; y: number }[]) {
  let total = 0
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y)
  let remaining = total / 2
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    if (remaining <= d && d > 0) return { x: a.x + ((b.x - a.x) * remaining) / d, y: a.y + ((b.y - a.y) * remaining) / d }
    remaining -= d
  }
  return points[points.length - 1] ?? { x: 0, y: 0 }
}

const drawn = computed(() =>
  props.paths
    .filter((p) => p.points.length > 1)
    .map((p) => {
      const pts = toPoints(p.points)
      return {
        id: p.id,
        order: props.paths.indexOf(p) + 1,
        points: attr(pts),
        start: pts[0]!,
        end: pts[pts.length - 1]!,
        mid: midpoint(pts),
        selected: p.id === props.selectedId,
        invalid: props.invalidIds.includes(p.id),
      }
    }),
)

const strokePoints = computed(() => (props.stroke && props.stroke.length > 1 ? attr(toPoints(props.stroke)) : ''))
const strokeStart = computed(() => (props.stroke?.length ? props.px(props.stroke[0]!) : null))
/** 正在画的线的笔尖 */
const strokeTip = computed(() =>
  props.stroke && props.stroke.length > 1 ? props.px(props.stroke[props.stroke.length - 1]!) : null,
)
</script>

<template>
  <svg class="path-layer" :class="variant" :width="size.w" :height="size.h" aria-hidden="true">
    <g v-for="p in drawn" :key="p.id" class="path" :class="{ selected: p.selected, invalid: p.invalid }">
      <polyline class="casing" :points="p.points" />
      <polyline class="line" :points="p.points" />
      <circle class="start" :cx="p.start.x" :cy="p.start.y" r="3" />
    </g>
    <g v-for="p in drawn" :key="`end-${p.id}`" class="path" :class="{ selected: p.selected }">
      <circle class="end" :cx="p.end.x" :cy="p.end.y" :r="p.selected ? 6.5 : 5.5" />
    </g>
    <template v-if="showNumbers">
      <g
        v-for="p in drawn"
        :key="`n-${p.id}`"
        class="badge"
        :class="{ selected: p.selected, invalid: p.invalid }"
        :transform="`translate(${p.mid.x.toFixed(1)} ${p.mid.y.toFixed(1)})`"
      >
        <circle r="9" />
        <text dy="0.36em">{{ p.order }}</text>
      </g>
    </template>
    <g v-if="strokePoints || strokeStart" class="path drawing selected">
      <polyline v-if="strokePoints" class="casing" :points="strokePoints" />
      <polyline v-if="strokePoints" class="line" :points="strokePoints" />
      <circle v-if="strokeStart" class="start" :cx="strokeStart.x" :cy="strokeStart.y" r="3.5" />
      <circle v-if="strokeTip" class="tip" :cx="strokeTip.x" :cy="strokeTip.y" r="5" />
    </g>
  </svg>
</template>

<style scoped>
.path-layer {
  --path: #3d8bff;
  --path-hi: #7cb2ff;
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
  pointer-events: none;
}
polyline {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.casing {
  stroke: rgb(4 8 12 / 0.6);
  stroke-width: 6;
}
.line {
  stroke: var(--path);
  stroke-width: 3;
}
.start {
  fill: var(--path);
  stroke: rgb(4 8 12 / 0.6);
  stroke-width: 1;
}
.end {
  fill: var(--path);
  stroke: #fff;
  stroke-width: 2.5;
  filter: drop-shadow(0 1px 3px rgb(0 0 0 / 0.6));
}
.path.selected .line {
  stroke: var(--path-hi);
  stroke-width: 4;
  filter: drop-shadow(0 0 4px rgb(61 139 255 / 0.9));
}
.path.selected .casing {
  stroke-width: 7;
}
.path.invalid .line {
  stroke-dasharray: 7 5;
}
.edit .path:not(.selected) .line {
  stroke: #2f6fd6;
}
.drawing .line {
  stroke: var(--path-hi);
}
.tip {
  fill: #fff;
  stroke: var(--path);
  stroke-width: 2.5;
  filter: drop-shadow(0 0 4px rgb(61 139 255 / 0.9));
}
.preview {
  opacity: 0.8;
}
.preview .line {
  stroke-width: 2.5;
}
.preview .casing {
  stroke-width: 5;
}

.badge circle {
  fill: #0d1419;
  stroke: var(--path);
  stroke-width: 2;
}
.badge text {
  fill: #fff;
  font-size: 11px;
  font-weight: 800;
  text-anchor: middle;
  font-variant-numeric: tabular-nums;
}
.badge.selected circle {
  fill: var(--path);
  stroke: #fff;
}
.badge.invalid circle {
  stroke: var(--danger);
}
</style>
