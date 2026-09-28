<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useUi, type SettingsTab } from '@/stores/ui'
import Icon from '@/components/common/Icon.vue'
import type { IconName } from '@/components/common/icons'
import Modal from '@/components/common/Modal.vue'
import AboutSettings from './AboutSettings.vue'
import DataSettings from './DataSettings.vue'
import DisplaySettings from './DisplaySettings.vue'
import TypeSettings from './TypeSettings.vue'
import './settings.css'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const tabs: { id: SettingsTab; label: string; icon: IconName }[] = [
  { id: 'types', label: '类型管理', icon: 'tag' },
  { id: 'display', label: '显示与图片', icon: 'sliders' },
  { id: 'data', label: '数据备份', icon: 'database' },
  { id: 'about', label: '关于', icon: 'info' },
]
// 当前分页记在全局状态里，方便从其他地方直接打开「数据备份」页
const { settingsTab: tab } = storeToRefs(useUi())
</script>

<template>
  <Modal :open="open" title="设置" :width="820" @close="emit('close')">
    <div class="settings">
      <nav class="tabs" aria-label="设置分类">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          class="tab"
          :class="{ active: tab === t.id }"
          :aria-current="tab === t.id ? 'page' : undefined"
          @click="tab = t.id"
        >
          <Icon :name="t.icon" :size="16" />
          {{ t.label }}
        </button>
      </nav>
      <div class="panel">
        <TypeSettings v-if="tab === 'types'" />
        <DisplaySettings v-else-if="tab === 'display'" />
        <DataSettings v-else-if="tab === 'data'" />
        <AboutSettings v-else />
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.settings {
  display: flex;
  height: min(600px, calc(100vh - 120px));
  height: min(600px, calc(100dvh - 120px));
}
.tabs {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 2px;
  width: 170px;
  padding: 12px 8px;
  border-right: 1px solid var(--line);
}
.tab {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-2);
  font-weight: 600;
  text-align: left;
}
.tab:hover {
  background: var(--surface-2);
  color: var(--text);
}
.tab.active {
  background: var(--accent-soft);
  color: #ffd6da;
  box-shadow: inset 2px 0 0 var(--accent);
}
.panel {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 18px 22px 24px;
}
@media (max-width: 640px) {
  .settings {
    flex-direction: column;
    height: calc(100dvh - 120px);
  }
  .tabs {
    flex-direction: row;
    width: auto;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .tab {
    flex: none;
  }
  .tab.active {
    box-shadow: inset 0 -2px 0 var(--accent);
  }
}
</style>
