<script setup lang="ts">
import { MARKER_PX, usePrefs, type MarkerSize } from '@/stores/prefs'

const { prefs } = usePrefs()

const sizes: { value: MarkerSize; label: string }[] = [
  { value: 'sm', label: '小' },
  { value: 'md', label: '中' },
  { value: 'lg', label: '大' },
]
const maxSides = [
  { value: 1280, label: '1280 px' },
  { value: 1600, label: '1600 px' },
  { value: 1920, label: '1920 px（推荐）' },
  { value: 2560, label: '2560 px' },
  { value: 4096, label: '4096 px' },
]
</script>

<template>
  <section class="s-section">
    <h3 class="s-title">地图显示</h3>
    <div class="s-row">
      <div class="s-row-text">
        <span class="s-row-label">标记点大小</span>
        <span class="s-row-hint">地图上 Lineup 圆点的尺寸</span>
      </div>
      <div class="segmented" role="group" aria-label="标记点大小">
        <button
          v-for="s in sizes"
          :key="s.value"
          type="button"
          :aria-pressed="prefs.markerSize === s.value"
          @click="prefs.markerSize = s.value"
        >
          <i class="size-dot" :style="{ width: `${MARKER_PX[s.value] * 0.75}px`, height: `${MARKER_PX[s.value] * 0.75}px` }" />
          {{ s.label }}
        </button>
      </div>
    </div>
    <div class="s-row">
      <div class="s-row-text">
        <span class="s-row-label">显示英雄立绘</span>
        <span class="s-row-hint">在首页地图空白处淡淡地显示当前英雄</span>
      </div>
      <button
        type="button"
        class="switch"
        role="switch"
        :aria-checked="prefs.showPortrait"
        aria-label="显示英雄立绘"
        @click="prefs.showPortrait = !prefs.showPortrait"
      />
    </div>
    <div class="s-row">
      <div class="s-row-text">
        <span class="s-row-label">显示地图操作提示</span>
        <span class="s-row-hint">首页左下角的「双击新建 · 滚轮缩放」提示条</span>
      </div>
      <button
        type="button"
        class="switch"
        role="switch"
        :aria-checked="!prefs.hintDismissed"
        aria-label="显示地图操作提示"
        @click="prefs.hintDismissed = !prefs.hintDismissed"
      />
    </div>
  </section>

  <section class="s-section">
    <h3 class="s-title">图片上传</h3>
    <p class="s-desc">
      游戏截图通常有几 MB，压缩后一般只有几百 KB，肉眼几乎看不出差别，可以大幅节省浏览器存储空间。
      无论是否压缩，都会额外生成一张小缩略图用于列表和预览。设置只影响之后上传的图片。
    </p>
    <div class="s-row">
      <div class="s-row-text">
        <span class="s-row-label">上传时压缩图片</span>
        <span class="s-row-hint">转为 WebP 格式并限制尺寸（GIF 动图不会被压缩）</span>
      </div>
      <button
        type="button"
        class="switch"
        role="switch"
        :aria-checked="prefs.compressImages"
        aria-label="上传时压缩图片"
        @click="prefs.compressImages = !prefs.compressImages"
      />
    </div>
    <div class="s-row" :class="{ disabled: !prefs.compressImages }">
      <div class="s-row-text">
        <span class="s-row-label">最长边</span>
        <span class="s-row-hint">超过这个尺寸的图片会被等比缩小</span>
      </div>
      <select v-model.number="prefs.maxImageSide" class="select" :disabled="!prefs.compressImages" aria-label="最长边">
        <option v-for="m in maxSides" :key="m.value" :value="m.value">{{ m.label }}</option>
      </select>
    </div>
    <div class="s-row" :class="{ disabled: !prefs.compressImages }">
      <div class="s-row-text">
        <span class="s-row-label">画质</span>
        <span class="s-row-hint">越高越清晰，文件也越大</span>
      </div>
      <div class="quality">
        <input
          v-model.number="prefs.imageQuality"
          type="range"
          min="0.6"
          max="0.95"
          step="0.05"
          :disabled="!prefs.compressImages"
          aria-label="画质"
        />
        <span class="tabular">{{ Math.round(prefs.imageQuality * 100) }}%</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.size-dot {
  display: inline-block;
  border-radius: 50%;
  background: #ff5a36;
  box-shadow: 0 0 0 2px #fff;
}
.disabled {
  opacity: 0.5;
}
.quality {
  display: flex;
  align-items: center;
  gap: 10px;
}
.quality input {
  width: 160px;
  accent-color: var(--cyan-dim);
}
.quality span {
  min-width: 36px;
  color: var(--text-2);
  font-size: 13px;
  text-align: right;
}
</style>
