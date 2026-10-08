<script setup lang="ts">
import { computed } from 'vue'
import { arrowGeometry, layoutText, penPositions, textBackground, TEXT_FONT_FAMILY } from '@/lib/annotations'
import type { Annotation, Position } from '@/types'

/**
 * 用 SVG 显示图片标注：铺满图片所在的框，坐标系就是原图像素（viewBox = 原图尺寸）。
 * 默认插槽可以放额外的 SVG 内容（编辑器的选中框等）。
 */
const props = defineProps<{
  annotations: readonly Annotation[]
  width: number
  height: number
  /** 不显示的标注（编辑文字时隐藏原来的那一个） */
  hiddenId?: string | null
}>()

const pts = (list: Position[]) => list.map((p) => `${p.x},${p.y}`).join(' ')

const shapes = computed(() =>
  props.annotations
    .filter((a) => a.id !== props.hiddenId)
    .map((a) => {
      switch (a.type) {
        case 'pen':
          return { a, points: pts(penPositions(a.points)) }
        case 'arrow': {
          const g = arrowGeometry(a)
          return { a, shaft: [g.tail, g.shaftEnd] as const, head: pts(g.head) }
        }
        case 'text':
          return { a, layout: layoutText(a), bg: textBackground(a.color) }
        default:
          return { a }
      }
    }),
)
</script>

<template>
  <svg
    class="annotation-layer"
    :viewBox="`0 0 ${width} ${height}`"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <template v-for="s in shapes" :key="s.a.id">
      <polyline
        v-if="s.a.type === 'pen'"
        class="stroke"
        :points="s.points"
        :stroke="s.a.color"
        :stroke-width="s.a.size"
      />
      <ellipse
        v-else-if="s.a.type === 'ellipse'"
        class="stroke"
        :cx="s.a.x + s.a.w / 2"
        :cy="s.a.y + s.a.h / 2"
        :rx="s.a.w / 2"
        :ry="s.a.h / 2"
        :stroke="s.a.color"
        :stroke-width="s.a.size"
      />
      <g v-else-if="s.a.type === 'arrow' && s.shaft">
        <line
          class="stroke"
          :x1="s.shaft[0].x"
          :y1="s.shaft[0].y"
          :x2="s.shaft[1].x"
          :y2="s.shaft[1].y"
          :stroke="s.a.color"
          :stroke-width="s.a.size"
        />
        <polygon :points="s.head" :fill="s.a.color" />
      </g>
      <g v-else-if="s.a.type === 'text' && s.layout">
        <rect
          :x="s.a.x"
          :y="s.a.y"
          :width="s.layout.width"
          :height="s.layout.height"
          :rx="s.layout.radius"
          :fill="s.bg"
        />
        <text
          v-for="(line, i) in s.layout.lines"
          :key="i"
          class="text"
          :x="s.a.x + s.layout.padX"
          :y="s.a.y + s.layout.padY + s.layout.lineHeight * (i + 0.5)"
          :fill="s.a.color"
          :font-size="s.a.size"
          :font-family="TEXT_FONT_FAMILY"
          >{{ line }}</text
        >
      </g>
    </template>
    <slot />
  </svg>
</template>

<style scoped>
.annotation-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
.stroke {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.text {
  font-weight: 700;
  dominant-baseline: central;
  white-space: pre;
}
</style>
