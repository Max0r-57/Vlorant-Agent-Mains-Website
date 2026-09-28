<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBackupActions } from '@/composables/useBackupActions'
import { useAutoBackup } from '@/stores/autoBackup'
import Icon from './Icon.vue'

/**
 * 页面顶部的自动备份提醒：有修改还没备份、而且需要用户操作时出现
 * （浏览器要求重新授权、文件夹找不到了、写入失败等）。
 */
const ab = useAutoBackup()
const { authorizeAndBackup, reconnectAndBackup } = useBackupActions()
const busy = ref(false)

const mode = computed<'authorize' | 'reselect' | 'retry' | null>(() => {
  if (!ab.needsAttention || ab.noticeDismissed) return null
  if (ab.permission === 'prompt') return 'authorize'
  if (ab.permission === 'denied' || ab.lastErrorCode === 'NotFoundError') return 'reselect'
  return 'retry'
})

const message = computed(() => {
  switch (mode.value) {
    case 'authorize':
      return `有修改还没备份：请允许网站访问备份文件夹「${ab.folderName}」`
    case 'reselect':
      return ab.permission === 'denied'
        ? `没有备份文件夹「${ab.folderName}」的访问权限，自动备份已暂停`
        : '找不到备份文件夹（可能被移动或删除了），自动备份已暂停'
    case 'retry':
      return `自动备份失败：${ab.lastError}`
    default:
      return ''
  }
})

const actionText = computed(() =>
  mode.value === 'authorize' ? '允许访问' : mode.value === 'reselect' ? '重新选择文件夹' : '重试',
)

async function act() {
  busy.value = true
  try {
    if (mode.value === 'authorize') await authorizeAndBackup()
    else if (mode.value === 'reselect') await reconnectAndBackup()
    else await ab.backupNow()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Transition name="notice">
    <div v-if="mode" class="backup-notice" :class="mode" role="alert">
      <Icon name="shield" :size="16" class="kind" />
      <span class="msg">{{ message }}</span>
      <button type="button" class="action" :disabled="busy" @click="act">{{ actionText }}</button>
      <button type="button" class="dismiss" aria-label="暂时忽略" title="暂时忽略" @click="ab.noticeDismissed = true">
        <Icon name="x" :size="14" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.backup-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(560px, calc(100vw - 32px));
  padding: 8px 8px 8px 12px;
  border: 1px solid rgb(255 210 63 / 0.45);
  border-radius: var(--r);
  background: #221d0b;
  box-shadow: var(--shadow-pop);
  color: var(--text);
  font-size: 13px;
  pointer-events: auto;
}
.backup-notice.retry,
.backup-notice.reselect {
  border-color: rgb(255 92 92 / 0.5);
  background: #2a1214;
}
.kind {
  flex: none;
  color: var(--gold);
}
.retry .kind,
.reselect .kind {
  color: var(--danger);
}
.msg {
  line-height: 1.5;
}
.action {
  flex: none;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--r-sm);
  background: var(--gold);
  color: #1b1400;
  font-size: 12px;
  font-weight: 800;
}
.retry .action,
.reselect .action {
  background: var(--accent);
  color: #fff;
}
.action:disabled {
  opacity: 0.6;
}
.dismiss {
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--r-xs);
  background: transparent;
  color: var(--text-3);
}
.dismiss:hover {
  background: rgb(255 255 255 / 0.08);
  color: var(--text);
}
.notice-enter-active,
.notice-leave-active {
  transition:
    opacity 0.2s var(--ease),
    transform 0.2s var(--ease);
}
.notice-enter-from,
.notice-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
