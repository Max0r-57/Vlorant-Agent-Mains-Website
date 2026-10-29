<script setup lang="ts">
import { routeName } from '@/lib/paths'
import type { PathRoute } from '@/types'
import Icon from '@/components/common/Icon.vue'

/** 现场演练时地图左下角的按钮；有多个路径版本时可以选择演练哪个版本 */
withDefaults(defineProps<{ finished?: boolean; routes?: PathRoute[] }>(), { routes: () => [] })
const emit = defineEmits<{ restart: []; exit: [] }>()
/** 演练的路径版本 */
const route = defineModel<number>('route', { default: 0 })
</script>

<template>
  <div class="rehearsal-controls" data-map-ui>
    <div v-if="routes.length > 1" class="versions" role="radiogroup" aria-label="路径版本">
      <Icon name="route" :size="15" class="versions-icon" />
      <button
        v-for="(r, i) in routes"
        :key="r.id"
        type="button"
        class="version ellipsis"
        role="radio"
        :aria-checked="i === route"
        @click="route = i"
      >
        {{ routeName(r, i) }}
      </button>
    </div>
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
  flex-wrap: wrap;
  align-items: center;
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
.versions {
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: min(520px, 100%);
  height: 36px;
  padding: 3px;
  overflow-x: auto;
  border: 1px solid var(--line-strong);
  border-radius: var(--r);
  background: rgb(18 27 34 / 0.9);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-card);
  scrollbar-width: none;
}
.versions-icon {
  margin: 0 4px 0 6px;
  color: #7cb2ff;
}
.version {
  flex: none;
  max-width: 120px;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
}
.version:hover {
  color: var(--text);
}
.version[aria-checked='true'] {
  background: #3d8bff;
  color: #fff;
}
</style>
