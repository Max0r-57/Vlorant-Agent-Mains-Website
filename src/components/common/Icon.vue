<script setup lang="ts">
import { ICONS, type IconName } from './icons'

withDefaults(defineProps<{ name: IconName; size?: number | string; stroke?: number }>(), {
  size: 18,
  stroke: 2,
})
</script>

<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    v-html="ICONS[name]"
  />
</template>

<style scoped>
.icon {
  flex: none;
  display: block;
}
</style>
