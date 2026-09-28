<script setup lang="ts">
import { useAutoBackup } from '@/stores/autoBackup'
import { useLineups } from '@/stores/lineups'
import { useUi } from '@/stores/ui'
import ConfirmHost from '@/components/common/ConfirmHost.vue'
import Icon from '@/components/common/Icon.vue'
import LightboxHost from '@/components/common/LightboxHost.vue'
import ToastHost from '@/components/common/ToastHost.vue'
import SettingsModal from '@/components/settings/SettingsModal.vue'

const store = useLineups()
const ui = useUi()
const autoBackup = useAutoBackup()
// 数据读取完成后再恢复自动备份（需要知道当前有没有 Lineup）
store.init().then(() => autoBackup.init())

function retry() {
  location.reload()
}
</script>

<template>
  <div v-if="store.status === 'error'" class="fatal">
    <Icon name="alert" :size="32" />
    <h1>无法打开本地数据库</h1>
    <p>{{ store.error }}</p>
    <p class="hint">
      本网站的数据保存在浏览器的 IndexedDB 中。请确认没有禁用网站数据（部分浏览器的无痕模式会禁用），然后重试。
    </p>
    <button type="button" class="btn btn-primary" @click="retry">重试</button>
  </div>

  <router-view v-else-if="store.status === 'ready'" v-slot="{ Component }">
    <keep-alive include="HomeView">
      <component :is="Component" />
    </keep-alive>
  </router-view>

  <div v-else class="loading" aria-busy="true">
    <span class="spinner" />
    正在读取本地数据…
  </div>

  <SettingsModal :open="ui.settingsOpen" @close="ui.settingsOpen = false" />
  <LightboxHost />
  <ConfirmHost />
  <ToastHost />
</template>

<style scoped>
.loading,
.fatal {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  padding: 24px;
  color: var(--text-2);
  text-align: center;
}
.fatal {
  color: var(--text);
}
.fatal :deep(.icon) {
  color: var(--danger);
}
.fatal h1 {
  font-size: 20px;
}
.fatal p {
  max-width: 520px;
  color: var(--text-2);
}
.fatal .hint {
  color: var(--text-3);
  font-size: 13px;
}
.spinner {
  width: 26px;
  height: 26px;
  border: 3px solid var(--line-strong);
  border-top-color: var(--cyan);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
