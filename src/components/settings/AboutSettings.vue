<script setup lang="ts">
import BrandMark from '@/components/common/BrandMark.vue'
import { BACKUP_GUIDE_URL, REPO_URL } from '@/data/links'

const version = __APP_VERSION__

const shortcuts: [string, string][] = [
  ['双击地图', '在该位置新建 Lineup'],
  ['双击圆点', '在相同位置新建 Lineup'],
  ['滚轮 / 双指', '缩放地图'],
  ['拖动地图', '平移'],
  ['/', '聚焦首页搜索框'],
  ['Ctrl + V', '在新建面板或详情页粘贴截图'],
  ['Ctrl + Enter', '保存新建的 Lineup'],
  ['Ctrl + S', '保存详情页的修改'],
  ['Esc', '关闭弹窗 / 预览'],
]
</script>

<template>
  <section class="s-section">
    <BrandMark />
    <p class="about">
      一个个人使用的无畏契约（VALORANT）Lineup 记录与回顾工具：在战术地图上标记定投、下烟等技巧的位置，
      配上截图和备注，随时搜索回顾。版本 {{ version }} ·
      <a :href="REPO_URL" target="_blank" rel="noopener">GitHub 仓库</a>
    </p>
  </section>
  <section class="s-section">
    <h3 class="s-title">快捷操作</h3>
    <dl class="keys">
      <template v-for="[k, v] in shortcuts" :key="k">
        <dt><span class="kbd">{{ k }}</span></dt>
        <dd>{{ v }}</dd>
      </template>
    </dl>
  </section>
  <section class="s-section">
    <h3 class="s-title">数据说明</h3>
    <ul class="notes">
      <li>数据保存在当前浏览器的 IndexedDB 中；不同浏览器、不同设备之间的数据互不相通。</li>
      <li>
        建议在「数据备份」中开启自动备份到文件夹。备份和恢复的详细步骤见
        <a :href="BACKUP_GUIDE_URL" target="_blank" rel="noopener">备份与恢复说明</a>。
      </li>
      <li>本地开发地址（localhost）和部署后的网址也是两份独立的数据，可以用「数据备份」导出再导入来迁移。</li>
      <li>Lineup 在地图上的位置按图片比例（万分比）保存，替换同样构图的高清地图图片后位置依然准确。</li>
    </ul>
  </section>
</template>

<style scoped>
.about {
  color: var(--text-2);
  line-height: 1.8;
}
.keys {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px 16px;
  margin: 0;
}
.keys dt {
  text-align: right;
}
.keys dd {
  margin: 0;
  color: var(--text-2);
}
.notes {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding-left: 18px;
  color: var(--text-2);
  line-height: 1.7;
}
</style>
