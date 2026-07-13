<template>
  <div class="app">
    <header class="header">
      <h1>工业视觉数据集工具箱</h1>
      <p class="subtitle">训练数据质检、清洗、增强与交付工具预演</p>
    </header>

    <main class="main">
      <!-- 功能选择 -->
      <DemoSelector v-model="activeDemo" :demos="demos" />

      <!-- 演示内容 -->
      <section class="demo-content">
        <ModelDemo v-if="activeDemo === 'model'" />
        <ImageMetadataDemo v-if="activeDemo === 'metadata'" />
        <DataCleanDemo
          v-if="activeDemo === 'clean'"
          ref="dataCleanRef"
          @open-preview="openDuplicatePreview"
        />
        <ImageSharpnessDemo v-if="activeDemo === 'sharpness'" />
        <AugmentDemo v-if="activeDemo === 'augment'" />
        <VideoFrameExtractorDemo v-if="activeDemo === 'video-frame'" />
      </section>
    </main>

    <footer class="footer">
      <p>Vision Dataset Toolkit - 训练数据质检、清洗、增强与交付工具预演</p>
    </footer>

    <!-- 重复图片预览对话框 -->
    <DuplicatePreview
      :visible="duplicatePreviewVisible"
      :current-item="currentDuplicateItem"
      :current-index="duplicatePreviewIndex"
      :total="duplicatePreviewTotal"
      :get-preview-url="getCleanPreviewUrl"
      @close="closeDuplicatePreview"
      @prev="showPrevDuplicate"
      @next="showNextDuplicate"
    />
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import DemoSelector from './components/DemoSelector.vue'
import ModelDemo from './components/ModelDemo.vue'
import ImageMetadataDemo from './components/ImageMetadataDemo.vue'
import DataCleanDemo from './components/DataCleanDemo.vue'
import ImageSharpnessDemo from './components/ImageSharpnessDemo.vue'
import AugmentDemo from './components/AugmentDemo.vue'
import VideoFrameExtractorDemo from './components/VideoFrameExtractorDemo.vue'
import DuplicatePreview from './components/DuplicatePreview.vue'

// 演示场景
const demos = [
  { id: 'model', name: '预处理体检', icon: '📐' },
  { id: 'metadata', name: '图片元数据', icon: '🕒' },
  { id: 'clean', name: '数据清洗', icon: '🧹' },
  { id: 'sharpness', name: '清晰度分析', icon: '🔎' },
  { id: 'augment', name: '样本增强', icon: '🔄' },
  { id: 'video-frame', name: '视频抽帧', icon: '🎞️' }
]

const activeDemo = ref('model')
const dataCleanRef = ref(null)

// 重复预览相关
const duplicatePreviewVisible = ref(false)
const duplicatePreviewIndex = ref(0)
const previewUrls = new Map()

const duplicatePreviewTotal = computed(() => dataCleanRef.value?.results?.duplicates?.length || 0)
const currentDuplicateItem = computed(() => dataCleanRef.value?.results?.duplicates?.[duplicatePreviewIndex.value] || null)

function getCleanPreviewUrl(file) {
  if (!file) return ''
  if (!previewUrls.has(file)) {
    previewUrls.set(file, URL.createObjectURL(file))
  }
  return previewUrls.get(file)
}

function openDuplicatePreview(index = 0) {
  if (duplicatePreviewTotal.value === 0) return
  duplicatePreviewIndex.value = Math.min(Math.max(index, 0), duplicatePreviewTotal.value - 1)
  duplicatePreviewVisible.value = true
}

function closeDuplicatePreview() {
  duplicatePreviewVisible.value = false
}

function showPrevDuplicate() {
  if (duplicatePreviewTotal.value === 0) return
  duplicatePreviewIndex.value = (duplicatePreviewIndex.value - 1 + duplicatePreviewTotal.value) % duplicatePreviewTotal.value
}

function showNextDuplicate() {
  if (duplicatePreviewTotal.value === 0) return
  duplicatePreviewIndex.value = (duplicatePreviewIndex.value + 1) % duplicatePreviewTotal.value
}

onUnmounted(() => {
  for (const url of previewUrls.values()) {
    URL.revokeObjectURL(url)
  }
  previewUrls.clear()
})
</script>

<style>
.app {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  color: #fff;
}

.header {
  text-align: center;
  padding: 40px 20px;
  background: rgba(0, 0, 0, 0.3);
}

.header h1 {
  font-size: 2.5rem;
  margin-bottom: 10px;
  background: linear-gradient(90deg, #00d4ff, #7b2cbf);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.subtitle {
  color: #888;
  font-size: 1.1rem;
}

.main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.demo-content {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 30px;
}

button,
el-button,
[role="button"],
[data-clickable="true"] {
  cursor: pointer;
}

button:disabled,
el-button[disabled],
[aria-disabled="true"] {
  cursor: not-allowed;
}

.footer {
  text-align: center;
  padding: 30px;
  color: #666;
}
</style>
