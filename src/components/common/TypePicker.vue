<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { TYPE_COLORS, useLineups } from '@/stores/lineups'
import { useUi } from '@/stores/ui'
import ColorPicker from './ColorPicker.vue'
import Dropdown from './Dropdown.vue'
import Icon from './Icon.vue'

/** 类型选择：下拉选择已有类型，或者直接在这里新建类型（名字 + 颜色） */
const props = defineProps<{ modelValue: string | null; invalid?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const store = useLineups()
const ui = useUi()

const open = ref(false)
const creating = ref(false)
const newName = ref('')
const newColor = ref(TYPE_COLORS[0]!)
const error = ref('')
const saving = ref(false)
const nameInput = ref<HTMLInputElement>()

const current = computed(() => (props.modelValue ? store.typeById.get(props.modelValue) : undefined))

function pick(id: string, close: () => void) {
  emit('update:modelValue', id)
  close()
}

function nextColor() {
  const used = new Set(store.types.map((t) => t.color.toLowerCase()))
  return TYPE_COLORS.find((c) => !used.has(c)) ?? TYPE_COLORS[store.types.length % TYPE_COLORS.length]!
}

async function startCreate() {
  creating.value = true
  newName.value = ''
  newColor.value = nextColor()
  error.value = ''
  await nextTick()
  nameInput.value?.focus()
}

async function confirmCreate(close: () => void) {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    const t = await store.createType(newName.value, newColor.value)
    emit('update:modelValue', t.id)
    ui.toast(`已新建类型「${t.name}」`)
    creating.value = false
    close()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

watch(open, (v) => {
  if (!v) creating.value = false
})
</script>

<template>
  <Dropdown v-model:open="open" match-width>
    <template #trigger="{ toggle }">
      <button
        type="button"
        class="trigger input"
        :class="{ 'is-invalid': invalid, open }"
        :aria-expanded="open"
        aria-haspopup="listbox"
        @click="toggle"
      >
        <template v-if="current">
          <i class="dot" :style="{ background: current.color }" />
          <span class="ellipsis">{{ current.name }}</span>
        </template>
        <span v-else class="placeholder">选择类型</span>
        <Icon name="chevronDown" :size="16" class="chev" />
      </button>
    </template>

    <template #default="{ close }">
      <div class="options" role="listbox" aria-label="Lineup 类型">
        <button
          v-for="t in store.sortedTypes"
          :key="t.id"
          type="button"
          class="option"
          data-dd-item
          role="option"
          :aria-selected="modelValue === t.id"
          @click="pick(t.id, close)"
        >
          <i class="dot" :style="{ background: t.color }" />
          <span class="ellipsis">{{ t.name }}</span>
          <span class="count tabular">{{ store.countByType.get(t.id) ?? 0 }}</span>
          <Icon v-if="modelValue === t.id" name="check" :size="16" class="tick" />
        </button>
        <p v-if="!store.types.length" class="empty">还没有类型，先新建一个吧</p>
      </div>

      <div class="create">
        <button v-if="!creating" type="button" class="create-btn" data-dd-item @click="startCreate">
          <Icon name="plus" :size="16" />
          新建类型
        </button>
        <form v-else class="create-form" @submit.prevent="confirmCreate(close)">
          <input
            ref="nameInput"
            v-model="newName"
            class="input"
            :class="{ 'is-invalid': error }"
            maxlength="20"
            placeholder="类型名称，如「燃烧弹」「下烟」"
            @keydown.stop
          />
          <ColorPicker v-model="newColor" />
          <p v-if="error" class="field-error">{{ error }}</p>
          <div class="create-actions">
            <span class="preview">
              <i class="dot" :style="{ background: newColor }" />
              {{ newName.trim() || '预览' }}
            </span>
            <button type="button" class="btn btn-ghost btn-sm" @click="creating = false">取消</button>
            <button type="submit" class="btn btn-primary btn-sm" :disabled="!newName.trim() || saving">创建</button>
          </div>
        </form>
      </div>
    </template>
  </Dropdown>
</template>

<style scoped>
.trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  cursor: pointer;
}
.trigger.open {
  border-color: var(--cyan-dim);
}
.placeholder {
  color: var(--text-3);
}
.chev {
  margin-left: auto;
  color: var(--text-3);
}
.dot {
  flex: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px #fff;
}
.options {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
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
.count {
  margin-left: auto;
  color: var(--text-3);
  font-size: 12px;
}
.tick {
  color: var(--cyan);
}
.empty {
  padding: 8px;
  color: var(--text-3);
  font-size: 13px;
}
.create {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--line);
}
.create-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--cyan);
  font-weight: 600;
  text-align: left;
}
.create-btn:hover,
.create-btn:focus-visible {
  background: var(--cyan-soft);
  outline: none;
}
.create-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 6px 4px 4px;
}
.create-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.preview {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: auto;
  color: var(--text-2);
  font-size: 12px;
}
</style>
