<script setup lang="ts">
import { useImageUrl } from '@/composables/useImageUrl'
import Icon from '@/components/common/Icon.vue'

/** Lineup 的封面图（没有图片时显示带类型颜色的占位） */
const props = withDefaults(
  defineProps<{ imageId?: string | null; color?: string; alt?: string; variant?: 'thumb' | 'full' }>(),
  { variant: 'thumb', color: '#94a3b8', alt: '' },
)
const { url } = useImageUrl(() => props.imageId, props.variant)
</script>

<template>
  <div class="thumb" :style="{ '--c': color }">
    <img v-if="url" :src="url" :alt="alt" draggable="false" />
    <div v-else class="ph">
      <Icon :name="imageId ? 'image' : 'crosshair'" :size="18" />
    </div>
  </div>
</template>

<style scoped>
.thumb {
  position: relative;
  overflow: hidden;
  background: var(--bg);
}
img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ph {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  background:
    radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--c) 30%, transparent), transparent 70%),
    var(--map-floor);
  color: color-mix(in srgb, var(--c) 70%, #fff);
}
</style>
