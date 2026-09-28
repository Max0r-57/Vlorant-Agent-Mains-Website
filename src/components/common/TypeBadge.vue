<script setup lang="ts">
import { computed } from 'vue'
import { useLineups } from '@/stores/lineups'

const props = defineProps<{ typeId: string; size?: 'sm' | 'md' }>()
const store = useLineups()
const type = computed(() => store.typeById.get(props.typeId))
</script>

<template>
  <span class="type-badge" :class="size ?? 'md'" :style="{ '--c': type?.color ?? '#94a3b8' }">
    <i class="dot" />
    <span class="ellipsis">{{ type?.name ?? '未分类' }}</span>
  </span>
</template>

<style scoped>
.type-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  height: 22px;
  padding: 0 8px 0 7px;
  border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--c) 14%, transparent);
  color: color-mix(in srgb, var(--c) 55%, #fff);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}
.type-badge.sm {
  height: 18px;
  padding: 0 6px 0 5px;
  gap: 4px;
  font-size: 11px;
}
.dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c);
  box-shadow: 0 0 0 1.5px rgb(255 255 255 / 0.85);
}
.sm .dot {
  width: 6px;
  height: 6px;
}
</style>
