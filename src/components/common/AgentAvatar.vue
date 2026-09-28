<script setup lang="ts">
import { computed } from 'vue'
import { AGENT_BY_ID } from '@/data/agents'

const props = withDefaults(defineProps<{ agentId: string | null | undefined; size?: number }>(), {
  size: 32,
})

const agent = computed(() => (props.agentId ? AGENT_BY_ID.get(props.agentId) : undefined))
// 没有头像时，用全身像的顶部代替
const src = computed(() => agent.value?.avatar ?? agent.value?.portrait)
const fromPortrait = computed(() => !agent.value?.avatar && !!agent.value?.portrait)
</script>

<template>
  <span class="avatar" :style="{ width: `${size}px`, height: `${size}px` }">
    <img
      v-if="src"
      :src="src"
      :alt="agent?.name"
      :class="{ portrait: fromPortrait }"
      draggable="false"
      loading="lazy"
    />
    <span v-else class="fallback" :style="{ fontSize: `${Math.round(size * 0.42)}px` }">
      {{ agent?.name.slice(0, 1) ?? '?' }}
    </span>
  </span>
</template>

<style scoped>
.avatar {
  position: relative;
  display: inline-grid;
  place-items: center;
  flex: none;
  overflow: hidden;
  border-radius: var(--r-sm);
  background: #dfe4e8;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08);
}
img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
img.portrait {
  object-position: 50% 0;
  transform: scale(2.4);
  transform-origin: 50% 8%;
}
.fallback {
  color: var(--bg);
  font-weight: 700;
}
</style>
