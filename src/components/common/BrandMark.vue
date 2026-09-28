<script setup lang="ts">
defineProps<{ compact?: boolean }>()
</script>

<template>
  <div class="brand-mark" :class="{ compact }">
    <svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M12 12h10l20 40H32z" fill="#ff4655" />
      <path d="M36 12h16v10H41z" fill="#ff4655" opacity=".65" />
      <circle cx="48" cy="44" r="7.5" fill="#78fbe7" stroke="#fff" stroke-width="3" />
    </svg>
    <div v-if="!compact" class="text">
      <span class="title">Lineup 笔记</span>
      <span class="sub">VALORANT LINEUP NOTEBOOK</span>
    </div>
  </div>
</template>

<style scoped>
.brand-mark {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.logo {
  flex: none;
  width: 30px;
  height: 30px;
}
.text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.title {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1.2;
}
.sub {
  color: var(--text-3);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.22em;
  white-space: nowrap;
}
</style>
