<template>
  <div class="demo-panel">
    <h2>{{ title }}</h2>
    <p class="demo-desc">{{ description }}</p>

    <div class="demo-area">
      <div class="upload-section">
        <input ref="fileInput" type="file" accept="image/*" multiple @change="handleUpload" />
        <button class="sharpness-button sharpness-button--primary" @click="fileInput.click()">
          选择图片
        </button>
        <button
          class="sharpness-button sharpness-button--accent"
          :disabled="files.length === 0 || analyzing"
          @click="analyzeImages"
        >
          {{ analyzing ? '分析中...' : '开始分析' }}
        </button>
        <button class="sharpness-button" :disabled="analyzing || files.length === 0" @click="clearImages">
          清空
        </button>
        <span v-if="files.length > 0" class="file-count">已选择 {{ files.length }} 张图片</span>
      </div>

      <div v-if="analyzing" class="progress-section">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progress + '%' }"></div>
        </div>
        <div class="progress-text">正在分析... {{ progress.toFixed(1) }}% ({{ analyzedCount }}/{{ files.length }})</div>
        <div v-if="currentFile" class="current-file">当前图片：{{ currentFile }}</div>
      </div>

      <div v-if="results.length > 0" class="sharpness-results">
        <div class="target-region-toolbar">
          <label class="target-region-toolbar__switch">
            <input v-model="targetRegionMode" type="checkbox" />
            <span>目标区域框选模式</span>
          </label>
          <span class="target-region-toolbar__hint">
            开启后在图片上拖拽框选目标区域，系统会优先展示目标区域清晰度。
          </span>
        </div>

        <div class="result-summary">
          <div class="summary-card success">
            <div class="summary-number">{{ averageScore }}</div>
            <div class="summary-label">平均评分</div>
          </div>
          <div class="summary-card warning">
            <div class="summary-number">{{ warningCount }}</div>
            <div class="summary-label">一般</div>
          </div>
          <div class="summary-card danger">
            <div class="summary-number">{{ blurryCount }}</div>
            <div class="summary-label">疑似模糊</div>
          </div>
        </div>

        <div class="sharpness-list">
          <article v-for="item in results" :key="item.id" class="sharpness-item">
            <div class="sharpness-item__preview">
              <div
                class="sharpness-item__image-frame"
                :class="{ 'sharpness-item__image-frame--selectable': targetRegionMode }"
                :style="{ aspectRatio: `${item.width} / ${item.height}` }"
                @pointerdown="onRegionPointerDown($event, item)"
                @pointermove="onRegionPointerMove($event, item)"
                @pointerup="onRegionPointerUp($event, item)"
                @pointercancel="cancelRegionSelection"
              >
                <img :src="item.previewUrl" :alt="item.fileName" />
                <div v-if="item.targetRegion" class="target-region-box" :style="getRegionStyle(item.targetRegion)"></div>
                <div
                  v-if="activeSelection?.itemId === item.id"
                  class="target-region-box target-region-box--active"
                  :style="getRegionStyle(getActiveSelectionRegion())"
                ></div>
              </div>
              <div class="sharpness-item__zoom">
                <img :src="item.previewUrl" :alt="`${item.fileName} 放大预览`" />
              </div>
            </div>
            <div class="sharpness-item__content">
              <div class="sharpness-item__header">
                <h3 :title="item.fileName">{{ item.fileName }}</h3>
                <span :class="['sharpness-level', `sharpness-level--${getDisplayLevel(item)}`]">
                  {{ getDisplayLevelText(item) }}
                </span>
              </div>
              <div class="sharpness-item__meta">
                {{ item.width }}x{{ item.height }} · {{ formatSize(item.size) }} · 全图方差 {{ item.variance.toFixed(2) }}
              </div>
              <div v-if="item.targetRegion" class="sharpness-item__meta sharpness-item__meta--target">
                目标区域 {{ formatRegionSize(item.targetRegion, item) }} · 方差 {{ item.targetVariance.toFixed(2) }} · 目标评分 {{ item.targetScore }}
              </div>
              <div class="sharpness-score">
                <strong>{{ getDisplayScore(item) }}</strong>
                <div class="sharpness-score__track">
                  <div
                    :class="['sharpness-score__value', `sharpness-score__value--${getDisplayLevel(item)}`]"
                    :style="{ width: getDisplayScore(item) + '%' }"
                  ></div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>

      <div v-if="errorMessage" class="error-panel">{{ errorMessage }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref } from 'vue'

defineProps({
  title: {
    type: String,
    default: '图片清晰度分析'
  },
  description: {
    type: String,
    default: '批量上传图片，基于边缘变化计算清晰度评分并展示预览结果'
  }
})

const SHARPNESS_SCORE_BASE = 500
const CLEAR_SCORE = 70
const WARNING_SCORE = 45

const fileInput = ref(null)
const files = ref([])
const results = ref([])
const analyzing = ref(false)
const analyzedCount = ref(0)
const currentFile = ref('')
const errorMessage = ref('')
const targetRegionMode = ref(false)
const activeSelection = ref(null)
const previewUrls = new Map()

const progress = computed(() => {
  if (files.value.length === 0) return 0
  return (analyzedCount.value / files.value.length) * 100
})

const averageScore = computed(() => {
  if (results.value.length === 0) return 0
  const total = results.value.reduce((sum, item) => sum + getDisplayScore(item), 0)
  return Math.round(total / results.value.length)
})

const warningCount = computed(() => results.value.filter((item) => getDisplayLevel(item) === 'warning').length)
const blurryCount = computed(() => results.value.filter((item) => getDisplayLevel(item) === 'danger').length)

function handleUpload(event) {
  const uploadedFiles = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'))
  if (uploadedFiles.length === 0) return

  revokePreviewUrls()
  files.value = uploadedFiles
  results.value = []
  analyzedCount.value = 0
  currentFile.value = ''
  errorMessage.value = ''
  activeSelection.value = null
}

async function analyzeImages() {
  if (files.value.length === 0) return

  analyzing.value = true
  analyzedCount.value = 0
  results.value = []
  errorMessage.value = ''

  const nextResults = []

  for (const file of files.value) {
    currentFile.value = file.name

    try {
      const analysis = await analyzeImageSharpness(file)
      nextResults.push(analysis)
    } catch (error) {
      errorMessage.value = `${file.name} 分析失败：${error instanceof Error ? error.message : String(error)}`
    } finally {
      analyzedCount.value += 1
    }
  }

  results.value = nextResults.sort((left, right) => right.score - left.score)
  currentFile.value = ''
  analyzing.value = false
}

async function analyzeImageSharpness(file) {
  const bitmap = await createImageBitmap(file)

  try {
    const variance = computeLaplacianVariance(bitmap)
    const score = normalizeSharpnessScore(variance)
    const level = getSharpnessLevel(score)

    return {
      id: `${file.name}-${file.lastModified}-${file.size}`,
      fileName: file.name,
      size: file.size,
      width: bitmap.width,
      height: bitmap.height,
      variance,
      score,
      level,
      levelText: getSharpnessLevelText(level),
      targetRegion: null,
      targetVariance: null,
      targetScore: null,
      targetLevel: '',
      targetLevelText: '',
      sourceFile: file,
      previewUrl: getPreviewUrl(file)
    }
  } finally {
    bitmap.close()
  }
}

function computeLaplacianVariance(bitmap, region = null) {
  const source = getSourceRegion(bitmap, region)
  const sample = getSampleSize(source.width, source.height)
  const canvas = document.createElement('canvas')
  canvas.width = sample.width
  canvas.height = sample.height

  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(bitmap, source.x, source.y, source.width, source.height, 0, 0, sample.width, sample.height)

  const imageData = context.getImageData(0, 0, sample.width, sample.height)
  const gray = new Float32Array(sample.width * sample.height)

  for (let index = 0; index < imageData.data.length; index += 4) {
    const pixelIndex = index / 4
    gray[pixelIndex] = imageData.data[index] * 0.299 + imageData.data[index + 1] * 0.587 + imageData.data[index + 2] * 0.114
  }

  const laplacianValues = []

  for (let y = 1; y < sample.height - 1; y++) {
    for (let x = 1; x < sample.width - 1; x++) {
      const index = y * sample.width + x
      const value = gray[index - sample.width] + gray[index - 1] - gray[index] * 4 + gray[index + 1] + gray[index + sample.width]
      laplacianValues.push(value)
    }
  }

  if (laplacianValues.length === 0) return 0

  const average = laplacianValues.reduce((sum, value) => sum + value, 0) / laplacianValues.length
  const variance = laplacianValues.reduce((sum, value) => sum + (value - average) ** 2, 0) / laplacianValues.length

  return variance
}

function getSourceRegion(bitmap, region) {
  if (!region) {
    return {
      x: 0,
      y: 0,
      width: bitmap.width,
      height: bitmap.height
    }
  }

  const x = Math.max(0, Math.min(bitmap.width - 1, Math.round(region.x * bitmap.width)))
  const y = Math.max(0, Math.min(bitmap.height - 1, Math.round(region.y * bitmap.height)))
  const width = Math.max(3, Math.min(bitmap.width - x, Math.round(region.width * bitmap.width)))
  const height = Math.max(3, Math.min(bitmap.height - y, Math.round(region.height * bitmap.height)))

  return { x, y, width, height }
}

function getSampleSize(width, height) {
  const maxSide = 720
  const scale = Math.min(1, maxSide / Math.max(width, height))

  return {
    width: Math.max(3, Math.round(width * scale)),
    height: Math.max(3, Math.round(height * scale))
  }
}

function normalizeSharpnessScore(variance) {
  return Math.max(0, Math.min(100, Math.round((variance / SHARPNESS_SCORE_BASE) * 100)))
}

function getSharpnessLevel(score) {
  if (score >= CLEAR_SCORE) return 'success'
  if (score >= WARNING_SCORE) return 'warning'
  return 'danger'
}

function getSharpnessLevelText(level) {
  const levelMap = {
    success: '清晰',
    warning: '一般',
    danger: '疑似模糊'
  }

  return levelMap[level]
}

function getDisplayScore(item) {
  return item.targetScore ?? item.score
}

function getDisplayLevel(item) {
  return item.targetLevel || item.level
}

function getDisplayLevelText(item) {
  return item.targetLevelText || item.levelText
}

function onRegionPointerDown(event, item) {
  if (!targetRegionMode.value) return

  const point = getNormalizedPointer(event)
  if (!point) return

  event.preventDefault()
  event.currentTarget.setPointerCapture?.(event.pointerId)

  activeSelection.value = {
    itemId: item.id,
    startX: point.x,
    startY: point.y,
    currentX: point.x,
    currentY: point.y
  }
}

function onRegionPointerMove(event, item) {
  if (!activeSelection.value || activeSelection.value.itemId !== item.id) return

  const point = getNormalizedPointer(event)
  if (!point) return

  activeSelection.value = {
    ...activeSelection.value,
    currentX: point.x,
    currentY: point.y
  }
}

function onRegionPointerUp(event, item) {
  if (!activeSelection.value || activeSelection.value.itemId !== item.id) return

  const region = getActiveSelectionRegion()
  activeSelection.value = null

  if (!region || region.width < 0.03 || region.height < 0.03) {
    errorMessage.value = '目标区域过小，请重新框选更完整的目标区域'
    return
  }

  event.currentTarget.releasePointerCapture?.(event.pointerId)
  updateTargetSharpness(item, region)
}

function cancelRegionSelection() {
  activeSelection.value = null
}

function getNormalizedPointer(event) {
  const rect = event.currentTarget.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return null

  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1)
  }
}

function getActiveSelectionRegion() {
  if (!activeSelection.value) return null

  const left = Math.min(activeSelection.value.startX, activeSelection.value.currentX)
  const top = Math.min(activeSelection.value.startY, activeSelection.value.currentY)
  const right = Math.max(activeSelection.value.startX, activeSelection.value.currentX)
  const bottom = Math.max(activeSelection.value.startY, activeSelection.value.currentY)

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  }
}

async function updateTargetSharpness(item, region) {
  const bitmap = await createImageBitmap(item.sourceFile)

  try {
    const targetVariance = computeLaplacianVariance(bitmap, region)
    const targetScore = normalizeSharpnessScore(targetVariance)
    const targetLevel = getSharpnessLevel(targetScore)

    item.targetRegion = region
    item.targetVariance = targetVariance
    item.targetScore = targetScore
    item.targetLevel = targetLevel
    item.targetLevelText = getSharpnessLevelText(targetLevel)
    errorMessage.value = ''
    results.value = [...results.value].sort((left, right) => getDisplayScore(right) - getDisplayScore(left))
  } catch (error) {
    errorMessage.value = `${item.fileName} 目标区域分析失败：${error instanceof Error ? error.message : String(error)}`
  } finally {
    bitmap.close()
  }
}

function getRegionStyle(region) {
  if (!region) return {}

  return {
    left: `${region.x * 100}%`,
    top: `${region.y * 100}%`,
    width: `${region.width * 100}%`,
    height: `${region.height * 100}%`
  }
}

function formatRegionSize(region, item) {
  const width = Math.round(region.width * item.width)
  const height = Math.round(region.height * item.height)
  return `${width}x${height}`
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function getPreviewUrl(file) {
  if (!previewUrls.has(file)) {
    previewUrls.set(file, URL.createObjectURL(file))
  }

  return previewUrls.get(file)
}

function clearImages() {
  revokePreviewUrls()
  files.value = []
  results.value = []
  analyzedCount.value = 0
  currentFile.value = ''
  errorMessage.value = ''
  activeSelection.value = null
  targetRegionMode.value = false

  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

function revokePreviewUrls() {
  for (const url of previewUrls.values()) {
    URL.revokeObjectURL(url)
  }

  previewUrls.clear()
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

onUnmounted(() => {
  revokePreviewUrls()
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
  flex-wrap: wrap;
}

.upload-section input[type="file"] {
  display: none;
}

.sharpness-button {
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border-radius: 8px;
  padding: 10px 18px;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s, transform 0.2s;
}

.sharpness-button:hover:not(:disabled) {
  border-color: #00d4ff;
  background: rgba(0, 212, 255, 0.12);
  transform: translateY(-1px);
}

.sharpness-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.sharpness-button--primary {
  border-color: rgba(0, 212, 255, 0.55);
  background: rgba(0, 212, 255, 0.18);
}

.sharpness-button--accent {
  border-color: rgba(34, 197, 94, 0.55);
  background: rgba(34, 197, 94, 0.18);
}

.file-count,
.current-file {
  color: #00d4ff;
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
  background: linear-gradient(90deg, #00d4ff, #22c55e);
  transition: width 0.3s ease;
}

.progress-text {
  margin-top: 10px;
  color: #00d4ff;
  text-align: center;
}

.target-region-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 20px;
  padding: 14px 16px;
  background: rgba(0, 212, 255, 0.08);
  border: 1px solid rgba(0, 212, 255, 0.18);
  border-radius: 10px;
}

.target-region-toolbar__switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #e2e8f0;
  cursor: pointer;
  user-select: none;
}

.target-region-toolbar__switch input {
  width: 16px;
  height: 16px;
  accent-color: #00d4ff;
}

.target-region-toolbar__hint {
  color: #94a3b8;
  font-size: 0.9rem;
}

.current-file {
  margin-top: 5px;
  text-align: center;
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.summary-card.warning {
  background: rgba(255, 165, 0, 0.15);
  border: 1px solid rgba(255, 165, 0, 0.3);
}

.summary-card.danger {
  background: rgba(255, 0, 0, 0.15);
  border: 1px solid rgba(255, 0, 0, 0.3);
}

.summary-number {
  font-size: 2rem;
  font-weight: bold;
  margin-bottom: 5px;
}

.summary-card.success .summary-number {
  color: #00ff00;
}

.summary-card.warning .summary-number {
  color: #ffaa00;
}

.summary-card.danger .summary-number {
  color: #ff4444;
}

.summary-label {
  color: #888;
  font-size: 0.9rem;
}

.sharpness-list {
  display: grid;
  gap: 14px;
}

.sharpness-item {
  position: relative;
  display: grid;
  grid-template-columns: 170px 1fr;
  gap: 18px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

.sharpness-item:hover {
  z-index: 5;
}

.sharpness-item__preview {
  position: relative;
  height: 110px;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 8px;
  overflow: visible;
}

.sharpness-item__preview > img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 8px;
}

.sharpness-item__image-frame {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 8px;
  overflow: hidden;
}

.sharpness-item__image-frame--selectable {
  cursor: crosshair;
  outline: 1px dashed rgba(0, 212, 255, 0.55);
  outline-offset: 3px;
}

.sharpness-item__image-frame img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 8px;
  user-select: none;
  -webkit-user-drag: none;
}

.target-region-box {
  position: absolute;
  border: 2px solid #00d4ff;
  background: rgba(0, 212, 255, 0.16);
  box-shadow: 0 0 0 999px rgba(0, 0, 0, 0.24);
  pointer-events: none;
}

.target-region-box--active {
  border-color: #facc15;
  background: rgba(250, 204, 21, 0.18);
}

.sharpness-item__zoom {
  position: absolute;
  left: calc(100% + 14px);
  top: 50%;
  z-index: 10;
  width: min(420px, 46vw);
  height: 280px;
  padding: 10px;
  background: rgba(8, 13, 24, 0.96);
  border: 1px solid rgba(0, 212, 255, 0.35);
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%) scale(0.96);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.sharpness-item__preview:hover .sharpness-item__zoom {
  opacity: 1;
  transform: translateY(-50%) scale(1);
}

.sharpness-item__zoom img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 8px;
}

.sharpness-item__content {
  min-width: 0;
}

.sharpness-item__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.sharpness-item__header h3 {
  margin: 0;
  font-size: 1rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sharpness-level {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.82rem;
}

.sharpness-level--success {
  background: rgba(34, 197, 94, 0.18);
  color: #86efac;
}

.sharpness-level--warning {
  background: rgba(245, 158, 11, 0.18);
  color: #facc15;
}

.sharpness-level--danger {
  background: rgba(239, 68, 68, 0.18);
  color: #fca5a5;
}

.sharpness-item__meta {
  color: #94a3b8;
  font-size: 0.88rem;
  margin: 10px 0 14px;
}

.sharpness-item__meta--target {
  color: #86efac;
  margin-top: -6px;
}

.sharpness-score {
  display: grid;
  grid-template-columns: 52px 1fr;
  align-items: center;
  gap: 12px;
}

.sharpness-score strong {
  font-size: 1.6rem;
  color: #fff;
}

.sharpness-score__track {
  height: 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  overflow: hidden;
}

.sharpness-score__value {
  height: 100%;
  border-radius: 999px;
}

.sharpness-score__value--success {
  background: linear-gradient(90deg, #22c55e, #a3e635);
}

.sharpness-score__value--warning {
  background: linear-gradient(90deg, #f59e0b, #facc15);
}

.sharpness-score__value--danger {
  background: linear-gradient(90deg, #ef4444, #fb7185);
}

.error-panel {
  margin-top: 18px;
  padding: 16px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.14);
  color: #fca5a5;
}

@media (max-width: 720px) {
  .result-summary,
  .sharpness-item {
    grid-template-columns: 1fr;
  }

  .sharpness-item__preview {
    height: 190px;
  }

  .sharpness-item__zoom {
    left: 50%;
    top: calc(100% + 12px);
    width: min(92vw, 420px);
    height: 260px;
    transform: translateX(-50%) scale(0.96);
  }

  .sharpness-item__preview:hover .sharpness-item__zoom {
    transform: translateX(-50%) scale(1);
  }
}
</style>