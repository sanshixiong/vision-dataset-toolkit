<template>
  <div class="demo-panel">
    <h2>{{ title }}</h2>
    <p class="demo-desc">{{ description }}</p>

    <div class="demo-area">
      <div class="upload-section">
        <input type="file" accept="image/*" multiple @change="handleUpload" ref="fileInput" />
        <button class="native-button native-button--primary" type="button" @click="$refs.fileInput.click()">
          选择图片（可多选）
        </button>
        <span v-if="files.length > 0" class="file-count">
          已选择 {{ files.length }} 个文件
        </span>
      </div>

      <div class="clean-options" v-if="files.length > 0">
        <div class="option-group">
          <label>去重相似度阈值: {{ similarityThreshold }}</label>
          <input v-model.number="similarityThreshold" class="native-range" type="range" min="0.8" max="1" step="0.01" />
        </div>
        <div class="option-group">
          <label>最大尺寸: {{ maxWidth }}x{{ maxHeight }}</label>
          <input v-model.number="maxWidth" class="native-range" type="range" min="720" max="3840" step="120" />
        </div>
      </div>

      <div class="clean-actions" v-if="files.length > 0 && !processing">
        <button class="native-button native-button--success" type="button" @click="startClean">
          开始清洗
        </button>
        <button class="native-button" type="button" @click="clearFiles">
          清空
        </button>
      </div>

      <!-- 进度条 -->
      <div class="progress-section" v-if="processing">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progress + '%' }"></div>
        </div>
        <div class="progress-text">
          处理中... {{ progress.toFixed(1) }}% ({{ processed }}/{{ files.length }})
        </div>
        <div class="current-file" v-if="currentFile">
          正在处理: {{ currentFile }}
        </div>
      </div>

      <!-- 结果展示 -->
      <div class="clean-results" v-if="results">
        <div class="result-summary">
          <div class="summary-card success">
            <div class="summary-number">{{ results.stats.passed }}</div>
            <div class="summary-label">通过</div>
          </div>
          <div class="summary-card warning">
            <div class="summary-number">{{ results.stats.duplicates }}</div>
            <div class="summary-label">重复</div>
          </div>
          <div class="summary-card danger">
            <div class="summary-number">{{ results.stats.badImages }}</div>
            <div class="summary-label">损坏</div>
          </div>
        </div>

        <div class="size-comparison" v-if="results.stats.passed > 0">
          <div class="size-item">
            <span>原始大小:</span>
            <strong>{{ formatSize(results.stats.originalTotalSize) }}</strong>
          </div>
          <div class="size-item">
            <span>清洗后:</span>
            <strong>{{ formatSize(results.stats.normalizedTotalSize) }}</strong>
          </div>
          <div class="size-item saved">
            <span>节省空间:</span>
            <strong>{{ calculateSavings(results.stats) }}</strong>
          </div>
        </div>

        <!-- 重复文件列表 -->
        <div class="failed-files" v-if="results.duplicates.length > 0">
          <div class="failed-files__header">
            <h4>重复文件 ({{ results.duplicates.length }})</h4>
            <button class="native-button native-button--warning native-button--small" type="button" @click="$emit('open-preview', 0)">
              预览重复项 ({{ duplicateTotal }})
            </button>
          </div>
          <div class="file-list">
            <div v-for="(item, idx) in results.duplicates" :key="idx" class="file-item duplicate">
              <span class="file-name">{{ item.fileName }}</span>
              <span class="file-stage">{{ item.stage }}</span>
              <span class="file-error" :title="item.error">{{ item.error }}</span>
            </div>
          </div>
        </div>

        <!-- 损坏文件列表 -->
        <div class="failed-files" v-if="results.badImages.length > 0">
          <h4>损坏文件 ({{ results.badImages.length }})</h4>
          <div class="file-list">
            <div v-for="(item, idx) in results.badImages" :key="idx" class="file-item corrupted">
              <span class="file-name">{{ item.fileName }}</span>
              <span class="file-stage">{{ item.stage }}</span>
              <span class="file-error" :title="item.error">{{ item.error }}</span>
            </div>
          </div>
        </div>

        <!-- 成功文件列表 -->
        <div class="success-files" v-if="results.success.length > 0">
          <h4>成功文件 ({{ results.success.length }})</h4>
          <div class="file-list">
            <div v-for="(item, idx) in results.success.slice(0, 20)" :key="idx" class="file-item success">
              <span class="file-name">{{ item.fileName }}</span>
              <span class="file-size">{{ formatSize(item.originalSize) }} → {{ formatSize(item.normalizedSize) }}</span>
              <span class="file-dims">{{ formatDimensions(item.dimensions) }} → {{ formatDimensions(item.normalizedDimensions) }}</span>
            </div>
            <div v-if="results.success.length > 20" class="more-files">
              ... 还有 {{ results.success.length - 20 }} 个文件
            </div>
          </div>
        </div>

        <!-- 下载按钮 -->
        <div class="download-section" v-if="results.success.length > 0">
          <button class="native-button native-button--primary" type="button" @click="downloadImages">
            下载清洗后的图片 (ZIP)
          </button>
          <button class="native-button" type="button" @click="downloadReport">
            下载报告 (Markdown)
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { DataCleaner } from '@/utils/data-cleaner.js'

defineProps({
  title: {
    type: String,
    default: '数据清洗'
  },
  description: {
    type: String,
    default: '批量图片数据清洗：去重、坏图剔除、尺寸归一化'
  }
})

defineEmits(['open-preview'])

const fileInput = ref(null)
const files = ref([])
const processing = ref(false)
const progress = ref(0)
const processed = ref(0)
const currentFile = ref('')
const results = ref(null)
const similarityThreshold = ref(0.95)
const maxWidth = ref(1920)
const maxHeight = ref(1080)

const dataCleaner = new DataCleaner()
const previewUrls = new Map()

const duplicateTotal = computed(() => results.value?.duplicates.length || 0)

function handleUpload(e) {
  const uploadedFiles = e.target.files
  if (!uploadedFiles || uploadedFiles.length === 0) return

  closePreview()
  revokePreviewUrls()
  files.value = Array.from(uploadedFiles)
  results.value = null
  progress.value = 0
  processed.value = 0
}

function clearFiles() {
  closePreview()
  revokePreviewUrls()
  files.value = []
  results.value = null
  progress.value = 0
  processed.value = 0
  currentFile.value = ''
}

function closePreview() {
  // handled by parent
}

function revokePreviewUrls() {
  for (const url of previewUrls.values()) {
    URL.revokeObjectURL(url)
  }
  previewUrls.clear()
}

function getPreviewUrl(file) {
  if (!file) return ''
  if (!previewUrls.has(file)) {
    previewUrls.set(file, URL.createObjectURL(file))
  }
  return previewUrls.get(file)
}

async function startClean() {
  if (files.value.length === 0) return

  processing.value = true
  progress.value = 0
  processed.value = 0
  results.value = null

  dataCleaner.similarityThreshold = similarityThreshold.value
  dataCleaner.targetWidth = maxWidth.value
  dataCleaner.targetHeight = maxHeight.value

  try {
    const cleanResults = await dataCleaner.processBatch(
      files.value,
      (current, total, result) => {
        progress.value = (current / total) * 100
        processed.value = current
        currentFile.value = result.fileName || ''
      }
    )

    results.value = cleanResults
    console.log('数据清洗完成:', cleanResults)
  } catch (error) {
    console.error('数据清洗失败:', error)
  } finally {
    processing.value = false
    currentFile.value = ''
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

function formatDimensions(dimensions) {
  if (!dimensions) return '-'
  return `${dimensions.width}x${dimensions.height}`
}

function calculateSavings(stats) {
  if (stats.originalTotalSize === 0) return '0%'
  const saved = 1 - stats.normalizedTotalSize / stats.originalTotalSize
  return (saved * 100).toFixed(1) + '%'
}

async function downloadImages() {
  if (!results.value || results.value.success.length === 0) return

  const JSZip = await import('jszip').then(m => m.default)
  const zip = new JSZip()

  for (const item of results.value.success) {
    zip.file(`cleaned_${item.fileName}`, item.blob)
  }

  const content = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(content)
  const a = document.createElement('a')
  a.href = url
  a.download = `cleaned_images_${new Date().getTime()}.zip`
  a.click()
  URL.revokeObjectURL(url)
}

function downloadReport() {
  if (!results.value) return

  const report = dataCleaner.generateReport(results.value)
  const blob = new Blob([report], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `clean_report_${new Date().getTime()}.md`
  a.click()
  URL.revokeObjectURL(url)
}

onUnmounted(() => {
  revokePreviewUrls()
})

defineExpose({
  results,
  getPreviewUrl
})
</script>

<style scoped>
.demo-panel h2 {
  font-size: 1.8rem;
  margin-bottom: 10px;
}

.demo-desc {
  color: #888;
  margin-bottom: 25px;
}

.demo-area {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 12px;
  padding: 25px;
}

.upload-section {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 25px;
}

.upload-section input[type="file"] {
  display: none;
}

.file-count {
  color: #00d4ff;
  margin-left: 10px;
}

.clean-options {
  display: flex;
  gap: 30px;
  margin-bottom: 20px;
  padding: 15px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.option-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-group label {
  color: #888;
  font-size: 0.9rem;
}

.clean-actions {
  margin-bottom: 20px;
}

.progress-section {
  margin: 20px 0;
  padding: 20px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
}

.progress-bar {
  height: 20px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #00d4ff, #7b2cbf);
  transition: width 0.3s ease;
}

.progress-text {
  margin-top: 10px;
  color: #00d4ff;
  text-align: center;
}

.current-file {
  margin-top: 5px;
  color: #888;
  font-size: 0.85rem;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.clean-results {
  margin-top: 20px;
}

.result-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
  margin-bottom: 20px;
}

.summary-card {
  padding: 20px;
  border-radius: 8px;
  text-align: center;
}

.summary-card.success {
  background: rgba(0, 255, 0, 0.15);
  border: 1px solid rgba(0, 255, 0, 0.3);
}

.summary-card.danger {
  background: rgba(255, 0, 0, 0.15);
  border: 1px solid rgba(255, 0, 0, 0.3);
}

.summary-card.warning {
  background: rgba(255, 165, 0, 0.15);
  border: 1px solid rgba(255, 165, 0, 0.3);
}

.summary-number {
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 5px;
}

.summary-card.success .summary-number {
  color: #00ff00;
}

.summary-card.danger .summary-number {
  color: #ff4444;
}

.summary-card.warning .summary-number {
  color: #ffaa00;
}

.summary-label {
  color: #888;
  font-size: 0.9rem;
}

.size-comparison {
  display: flex;
  justify-content: space-around;
  padding: 15px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  margin-bottom: 20px;
}

.size-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.size-item span {
  color: #888;
  font-size: 0.9rem;
}

.size-item strong {
  color: #fff;
  font-size: 1.2rem;
}

.size-item.saved strong {
  color: #00ff00;
}

.failed-files,
.success-files {
  margin-bottom: 20px;
}

.failed-files__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.failed-files h4,
.success-files h4 {
  margin-bottom: 0;
  color: #fff;
}

.file-list {
  max-height: 300px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 10px;
  width: 100%;
  box-sizing: border-box;
}

.file-item {
  display: grid;
  grid-template-columns: 2fr 100px 2fr;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 4px;
  margin-bottom: 5px;
  font-size: 0.9rem;
  align-items: center;
}

.file-item.success {
  background: rgba(0, 255, 0, 0.1);
}

.file-item.duplicate {
  background: rgba(255, 193, 7, 0.15);
  border-left: 3px solid #ffc107;
}

.file-item.corrupted {
  background: rgba(245, 108, 108, 0.15);
  border-left: 3px solid #f56c6c;
}

.file-name {
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-stage {
  color: #888;
  font-size: 0.8rem;
  text-align: center;
}

.file-error {
  color: #ff6666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size {
  color: #00d4ff;
  text-align: center;
}

.file-dims {
  color: #888;
  text-align: right;
}

.more-files {
  text-align: center;
  padding: 10px;
  color: #888;
  font-style: italic;
}

.download-section {
  display: flex;
  gap: 15px;
  justify-content: center;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
