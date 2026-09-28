<script setup lang="ts">
import { computed } from 'vue'
import { formatShort } from '@/lib/format'
import { useAutoBackup } from '@/stores/autoBackup'
import { useLineups } from '@/stores/lineups'
import { useUi } from '@/stores/ui'
import Icon from './Icon.vue'
import type { IconName } from './icons'

/** 导览栏底部的自动备份状态，点击打开「设置 → 数据备份」 */
const ab = useAutoBackup()
const store = useLineups()
const ui = useUi()

function timeOf(ts: number) {
  const d = new Date(ts)
  const today = new Date()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return d.toDateString() === today.toDateString() ? hm : formatShort(ts)
}

const state = computed<{ text: string; cls: string; icon: IconName; title: string } | null>(() => {
  if (!ab.supported) return null
  if (!ab.enabled) {
    if (!store.lineups.length) return null
    return { text: '未开启自动备份 · 点击设置', cls: 'off', icon: 'shield', title: '数据只存在浏览器里，建议开启自动备份' }
  }
  if (ab.running) return { text: '正在自动备份…', cls: 'busy', icon: 'shield', title: `备份到「${ab.folderName}」` }
  if (ab.dirty && ab.permission !== 'granted') {
    return { text: '自动备份待授权 · 点击处理', cls: 'warn', icon: 'shield', title: '需要允许访问备份文件夹' }
  }
  if (ab.dirty && ab.lastError) {
    return { text: '自动备份失败 · 点击查看', cls: 'error', icon: 'shield', title: ab.lastError }
  }
  if (ab.dirty) return { text: '有修改，稍后自动备份', cls: 'busy', icon: 'shield', title: '几秒后自动备份' }
  if (ab.lastBackupAt) {
    return {
      text: `已自动备份 · ${timeOf(ab.lastBackupAt)}`,
      cls: 'ok',
      icon: 'shieldCheck',
      title: `最新数据已保存到「${ab.folderName}」`,
    }
  }
  return { text: '自动备份已开启', cls: 'ok', icon: 'shieldCheck', title: `备份到「${ab.folderName}」` }
})
</script>

<template>
  <button
    v-if="state"
    type="button"
    class="chip"
    :class="state.cls"
    :title="state.title"
    @click="ui.openSettings('data')"
  >
    <Icon :name="state.icon" :size="14" />
    <span class="ellipsis">{{ state.text }}</span>
  </button>
</template>

<style scoped>
.chip {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
  height: 30px;
  padding: 0 16px;
  border: 0;
  border-top: 1px solid var(--line);
  background: transparent;
  text-align: left;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
}
.chip:hover {
  background: var(--surface-2);
  color: var(--text-2);
}
.chip.ok {
  color: var(--success);
}
.chip.busy {
  color: var(--cyan);
}
.chip.warn {
  color: var(--gold);
}
.chip.error {
  color: var(--danger);
}
</style>
