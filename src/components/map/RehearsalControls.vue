<script setup lang="ts">
import Icon from '@/components/common/Icon.vue'

/** 现场演练时地图左下角的按钮 */
defineProps<{ finished?: boolean }>()
const emit = defineEmits<{ restart: []; exit: [] }>()
</script>

<template>
  <div class="rehearsal-controls" data-map-ui>
    <button type="button" class="btn hud-btn" :class="{ pulse: finished }" @click="emit('restart')">
      <Icon name="refresh" :size="15" />
      重现演练
    </button>
    <button type="button" class="btn hud-btn exit" @click="emit('exit')">
      <Icon name="x" :size="15" />
      结束演练
    </button>
  </div>
</template>

<style scoped>
.rehearsal-controls {
  display: flex;
  gap: 8px;
}
.hud-btn {
  --btn-bg: rgb(18 27 34 / 0.9);
  height: 36px;
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-card);
}
.hud-btn :deep(.icon) {
  color: var(--cyan);
}
.exit {
  --btn-border: rgb(255 70 85 / 0.45);
}
.exit :deep(.icon) {
  color: var(--accent);
}
.pulse {
  border-color: var(--cyan-dim);
}
</style>
