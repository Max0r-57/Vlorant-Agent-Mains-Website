<script setup lang="ts">
import { computed } from 'vue'
import { useUi } from '@/stores/ui'
import Icon from './Icon.vue'
import Modal from './Modal.vue'

const ui = useUi()
const state = computed(() => ui.confirmState)
</script>

<template>
  <Modal :open="!!state" :width="420" z-index="var(--z-confirm)" @close="ui.settleConfirm(false)">
    <div v-if="state" class="confirm">
      <span class="icon" :class="{ danger: state.danger }">
        <Icon :name="state.danger ? 'alert' : 'info'" :size="20" />
      </span>
      <div class="text">
        <h2>{{ state.title }}</h2>
        <p v-if="state.message">{{ state.message }}</p>
      </div>
    </div>
    <template #footer>
      <button type="button" class="btn btn-ghost" :autofocus="!!state?.danger" @click="ui.settleConfirm(false)">
        {{ state?.cancelText ?? '取消' }}
      </button>
      <button v-if="state?.altText" type="button" class="btn btn-outline" @click="ui.settleConfirm('alt')">
        {{ state.altText }}
      </button>
      <button
        type="button"
        class="btn"
        :class="state?.danger ? 'btn-danger' : 'btn-primary'"
        :autofocus="!state?.danger"
        @click="ui.settleConfirm(true)"
      >
        {{ state?.confirmText ?? '确定' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.confirm {
  display: flex;
  gap: 14px;
  padding: 20px 20px 16px;
}
.icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--cyan-soft);
  color: var(--cyan);
}
.icon.danger {
  background: var(--danger-soft);
  color: var(--danger);
}
.text h2 {
  margin-top: 2px;
  font-size: 16px;
  font-weight: 700;
}
.text p {
  margin-top: 6px;
  color: var(--text-2);
  white-space: pre-line;
}
</style>
