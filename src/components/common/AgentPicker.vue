<script setup lang="ts">
import { computed, ref } from 'vue'
import { AGENTS, AGENT_BY_ID, ROLE_LABEL, ROLE_ORDER } from '@/data/agents'
import AgentAvatar from './AgentAvatar.vue'
import Dropdown from './Dropdown.vue'
import Icon from './Icon.vue'

const props = withDefaults(
  defineProps<{
    /** null 表示「全部英雄」（需要 allowAll） */
    modelValue: string | null
    allowAll?: boolean
    counts?: Map<string, number>
    variant?: 'hero' | 'compact'
  }>(),
  { variant: 'compact' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()

const open = ref(false)
const current = computed(() => (props.modelValue ? AGENT_BY_ID.get(props.modelValue) : undefined))
const groups = computed(() =>
  ROLE_ORDER.map((role) => ({ role, label: ROLE_LABEL[role], agents: AGENTS.filter((a) => a.role === role) })),
)

function pick(id: string | null, close: () => void) {
  emit('update:modelValue', id)
  close()
}
</script>

<template>
  <Dropdown v-model:open="open" :width="396">
    <template #trigger="{ toggle }">
      <button
        v-if="variant === 'hero'"
        type="button"
        class="hero"
        :class="{ open }"
        :aria-expanded="open"
        aria-haspopup="listbox"
        @click="toggle"
      >
        <img v-if="current?.portrait" class="hero-portrait" :src="current.portrait" alt="" draggable="false" />
        <AgentAvatar :agent-id="modelValue" :size="44" class="hero-avatar" />
        <span class="hero-text">
          <span class="eyebrow">Agent · 英雄</span>
          <span class="hero-name">{{ current?.name ?? '全部英雄' }}</span>
          <span v-if="current" class="hero-role">{{ ROLE_LABEL[current.role] }} · {{ current.en }}</span>
        </span>
        <Icon name="chevronDown" class="chev" />
      </button>
      <button
        v-else
        type="button"
        class="compact btn btn-outline"
        :class="{ open }"
        :aria-expanded="open"
        aria-haspopup="listbox"
        @click="toggle"
      >
        <AgentAvatar v-if="current" :agent-id="modelValue" :size="20" />
        <Icon v-else name="user" :size="16" />
        <span class="ellipsis">{{ current?.name ?? '全部英雄' }}</span>
        <Icon name="chevronDown" :size="16" class="chev" />
      </button>
    </template>

    <template #default="{ close }">
      <div class="panel" role="listbox" aria-label="选择英雄">
        <button
          v-if="allowAll"
          type="button"
          class="all"
          data-dd-item
          role="option"
          :aria-selected="modelValue === null"
          @click="pick(null, close)"
        >
          <Icon name="layers" :size="16" />
          全部英雄
          <Icon v-if="modelValue === null" name="check" :size="16" class="tick" />
        </button>
        <section v-for="g in groups" :key="g.role" class="group">
          <h4 class="group-title">{{ g.label }}</h4>
          <div class="grid">
            <button
              v-for="a in g.agents"
              :key="a.id"
              type="button"
              class="tile"
              data-dd-item
              role="option"
              :aria-selected="modelValue === a.id"
              :title="`${a.name} ${a.en}`"
              @click="pick(a.id, close)"
            >
              <span class="tile-avatar">
                <AgentAvatar :agent-id="a.id" :size="42" />
                <span v-if="counts?.get(a.id)" class="badge tabular">{{ counts.get(a.id) }}</span>
              </span>
              <span class="tile-name ellipsis">{{ a.name }}</span>
            </button>
          </div>
        </section>
      </div>
    </template>
  </Dropdown>
</template>

<style scoped>
.hero {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 72px;
  padding: 0 14px;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: var(--r);
  background:
    radial-gradient(120% 140% at 100% 0%, rgb(255 70 85 / 0.16), transparent 55%),
    var(--surface);
  text-align: left;
  transition: border-color 0.15s var(--ease);
}
.hero:hover,
.hero.open {
  border-color: var(--cyan-dim);
}
.hero-portrait {
  position: absolute;
  right: 26px;
  top: -6px;
  width: 120px;
  height: auto;
  opacity: 0.5;
  pointer-events: none;
  mask-image: linear-gradient(90deg, transparent, #000 40%);
}
.hero-avatar {
  position: relative;
  z-index: 1;
}
.hero-text {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.hero-name {
  font-size: 18px;
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: 0.04em;
}
.hero-role {
  color: var(--text-2);
  font-size: 12px;
}
.chev {
  position: relative;
  z-index: 1;
  color: var(--text-2);
  transition: transform 0.2s var(--ease);
}
.open .chev {
  transform: rotate(180deg);
}

.compact {
  justify-content: flex-start;
  min-width: 130px;
  max-width: 200px;
  font-weight: 500;
}
.compact .chev {
  margin-left: auto;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px;
}
.all {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: transparent;
  font-weight: 600;
}
.all:hover,
.all:focus-visible,
.all[aria-selected='true'] {
  background: var(--cyan-soft);
  outline: none;
}
.all .tick {
  margin-left: auto;
  color: var(--cyan);
}
.group-title {
  margin: 2px 2px 6px;
  color: var(--text-3);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
}
.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 6px 2px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  font-size: 12px;
}
.tile:hover,
.tile:focus-visible {
  background: var(--surface-2);
  outline: none;
}
.tile[aria-selected='true'] {
  border-color: var(--cyan-dim);
  background: var(--cyan-soft);
}
.tile-avatar {
  position: relative;
}
.badge {
  position: absolute;
  right: -5px;
  top: -5px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  box-shadow: 0 0 0 2px var(--surface);
}
.tile-name {
  max-width: 100%;
  color: var(--text-2);
}
.tile[aria-selected='true'] .tile-name {
  color: var(--text);
}
</style>
