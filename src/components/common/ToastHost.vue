<script setup lang="ts">
import { useUi } from '@/stores/ui'
import BackupNotice from './BackupNotice.vue'
import Icon from './Icon.vue'

const ui = useUi()
</script>

<template>
  <Teleport to="body">
    <div class="toasts" role="status" aria-live="polite">
      <BackupNotice />
      <TransitionGroup name="toast">
        <div v-for="t in ui.toasts" :key="t.id" class="toast" :class="t.kind">
          <Icon :name="t.kind === 'error' ? 'alert' : t.kind === 'info' ? 'info' : 'check'" :size="16" class="kind" />
          <span class="msg">{{ t.message }}</span>
          <button
            v-if="t.action"
            type="button"
            class="action"
            @click="t.action.run(); ui.dismissToast(t.id)"
          >
            {{ t.action.label }}
          </button>
          <button type="button" class="dismiss" aria-label="关闭提示" @click="ui.dismissToast(t.id)">
            <Icon name="x" :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toasts {
  position: fixed;
  left: 50%;
  top: 16px;
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transform: translateX(-50%);
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(480px, calc(100vw - 32px));
  padding: 9px 10px 9px 14px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r);
  background: var(--surface-2);
  box-shadow: var(--shadow-pop);
  pointer-events: auto;
}
.kind {
  color: var(--success);
}
.error .kind {
  color: var(--danger);
}
.info .kind {
  color: var(--cyan);
}
.msg {
  font-size: 13px;
}
.action {
  flex: none;
  border: 0;
  background: none;
  color: var(--cyan);
  font-weight: 700;
  font-size: 13px;
}
.dismiss {
  display: grid;
  flex: none;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: var(--r-xs);
  background: transparent;
  color: var(--text-3);
}
.dismiss:hover {
  background: var(--surface-3);
  color: var(--text);
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s var(--ease),
    transform 0.2s var(--ease);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
