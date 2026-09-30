<script setup lang="ts">
import { computed, ref } from 'vue'
import { MOVE_MODE_BY_ID, MOVE_MODE_GROUPS } from '@/data/movement'
import Dropdown from '@/components/common/Dropdown.vue'
import Icon from '@/components/common/Icon.vue'

/** 行走方式选择：按武器分组，显示每种方式的移动速度 */
const props = defineProps<{ modelValue: string; invalid?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const current = computed(() => MOVE_MODE_BY_ID.get(props.modelValue))

function pick(id: string, close: () => void) {
  emit('update:modelValue', id)
  close()
}
</script>

<template>
  <Dropdown v-model:open="open" :width="236">
    <template #trigger="{ toggle }">
      <button
        type="button"
        class="trigger input"
        :class="{ 'is-invalid': invalid, open }"
        :aria-expanded="open"
        aria-haspopup="listbox"
        aria-label="行走方式"
        @click="toggle"
      >
        <template v-if="current">
          <span class="ellipsis">{{ current.label }}</span>
          <span class="speed tabular">{{ current.speed }}</span>
        </template>
        <span v-else class="placeholder">选择行走方式</span>
        <Icon name="chevronDown" :size="16" class="chev" />
      </button>
    </template>

    <template #default="{ close }">
      <div class="groups" role="listbox" aria-label="行走方式">
        <div v-for="g in MOVE_MODE_GROUPS" :key="g.label" class="group">
          <div class="group-label eyebrow">{{ g.label }}</div>
          <button
            v-for="m in g.modes"
            :key="m.id"
            type="button"
            class="option"
            data-dd-item
            role="option"
            :aria-selected="modelValue === m.id"
            @click="pick(m.id, close)"
          >
            <span class="ellipsis">{{ m.label }}</span>
            <span class="speed tabular">{{ m.speed }} m/s</span>
            <Icon v-if="modelValue === m.id" name="check" :size="15" class="tick" />
          </button>
        </div>
      </div>
    </template>
  </Dropdown>
</template>

<style scoped>
.trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  text-align: left;
  cursor: pointer;
}
.trigger.open {
  border-color: var(--cyan-dim);
}
.placeholder {
  color: var(--text-3);
}
.trigger .speed {
  margin-left: auto;
  color: var(--text-3);
  font-size: 12px;
}
.chev {
  flex: none;
  color: var(--text-3);
}
.trigger .speed + .chev {
  margin-left: 0;
}
.trigger .placeholder + .chev {
  margin-left: auto;
}
.groups {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.group-label {
  padding: 6px 8px 2px;
}
.option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  text-align: left;
}
.option:hover,
.option:focus-visible {
  background: var(--surface-2);
  outline: none;
}
.option[aria-selected='true'] {
  background: var(--cyan-soft);
}
.option .speed {
  margin-left: auto;
  color: var(--text-3);
  font-size: 12px;
}
.tick {
  flex: none;
  color: var(--cyan);
}
</style>
