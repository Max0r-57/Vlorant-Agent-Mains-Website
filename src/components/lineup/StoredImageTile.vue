<script setup lang="ts">
import { useImageUrl } from '@/composables/useImageUrl'

const props = defineProps<{ id: string }>()
const { url } = useImageUrl(() => props.id, 'thumb')
</script>

<template>
  <img v-if="url" :src="url" alt="" draggable="false" />
</template>
