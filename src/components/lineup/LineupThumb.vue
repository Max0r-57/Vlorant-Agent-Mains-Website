<script setup lang="ts">
import MediaThumb from '@/components/media/MediaThumb.vue'

/** Lineup 的封面（没有图片时显示带类型颜色的占位；封面是视频时显示角标，鼠标悬停播放） */
withDefaults(
  defineProps<{
    imageId?: string | null
    color?: string
    alt?: string
    variant?: 'thumb' | 'full'
    hoverPlay?: boolean
    badge?: 'full' | 'icon' | 'none'
  }>(),
  { imageId: null, variant: 'thumb', color: '#94a3b8', alt: '', hoverPlay: true, badge: 'full' },
)
</script>

<template>
  <MediaThumb
    class="thumb"
    :media-id="imageId"
    :color="color"
    :alt="alt"
    :variant="variant"
    :hover-play="hoverPlay"
    :badge="badge"
    empty-icon="crosshair"
  />
</template>
