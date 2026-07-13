<template>
  <div class="demo-panel">
    <h2>{{ title }}</h2>
    <p class="demo-desc">{{ description }}</p>

    <div class="demo-area">
      <div class="upload-section">
        <input type="file" accept="image/*" @change="handleUpload" ref="fileInput" />
        <button class="native-button native-button--primary" type="button" @click="$refs.fileInput.click()">
          选择图片
        </button>
        <span v-if="selectedFile" class="file-name">{{ selectedFile.name }}</span>
      </div>

      <div v-if="loading" class="status-panel">
        <span class="status-text">正在读取图片元数据...</span>
      </div>

      <div class="metadata-layout" v-if="metadata && !loading">
        <div class="preview-section" v-if="imagePreview">
          <div class="image-box">
            <img :src="imagePreview" alt="元数据预览图像" />
            <div class="image-label">预览图像</div>
          </div>
        </div>

        <div class="metadata-panel">
          <div class="metadata-summary">
            <div class="summary-card">
              <span class="summary-label">创建时间</span>
              <strong>{{ formatDate(metadata.createdAt) }}</strong>
              <small>{{ metadata.createdAtSource || '无来源' }}</small>
            </div>
            <div class="summary-card">
              <span class="summary-label">EXIF</span>
              <strong>{{ metadata.hasExif ? '已读取' : '未发现' }}</strong>
              <small>{{ metadata.error || '用于检测前处理' }}</small>
            </div>
          </div>

          <div class="metadata-list">
            <div v-for="item in metadataItems" :key="item.label" class="metadata-item">
              <span class="metadata-item__label">{{ item.label }}</span>
              <span class="metadata-item__value">{{ item.value }}</span>
            </div>
          </div>

          <div class="metadata-raw">
            <div class="metadata-raw__header">
              <h3>完整元数据</h3>
              <span>{{ rawMetadataCount }} 个字段</span>
            </div>
            <pre>{{ rawMetadataText }}</pre>
          </div>
        </div>
      </div>

      <div v-if="metadata?.error" class="error-panel">
        {{ metadata.error }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref } from 'vue'
import { readImageMetadata } from '@/utils/image-metadata.js'

defineProps({
  title: {
    type: String,
    default: '图片元数据'
  },
  description: {
    type: String,
    default: '读取图片 EXIF 元数据，提取创建时间、相机、GPS 等检测前处理信息'
  }
})

const fileInput = ref(null)
const selectedFile = ref(null)
const imagePreview = ref('')
const metadata = ref(null)
const loading = ref(false)

const metadataItems = computed(() => {
  if (!metadata.value) return []

  const camera = metadata.value.camera || {}
  const gps = metadata.value.gps

  return [
    { label: '文件大小', value: formatSize(metadata.value.file?.size) },
    { label: 'MIME 类型', value: formatValue(metadata.value.file?.type) },
    { label: '相机品牌', value: formatValue(camera.make) },
    { label: '相机型号', value: formatValue(camera.model) },
    { label: '镜头型号', value: formatValue(camera.lensModel) },
    { label: '方向信息', value: formatValue(metadata.value.orientation) },
    { label: 'GPS 坐标', value: gps ? `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}` : '无' }
  ]
})

const rawMetadataCount = computed(() => Object.keys(metadata.value?.raw || {}).length)
const rawMetadataText = computed(() => JSON.stringify(metadata.value?.raw || {}, formatRawMetadata, 2))

async function handleUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return

  selectedFile.value = file
  metadata.value = null
  loading.value = true
  updatePreview(file)

  try {
    metadata.value = await readImageMetadata(file)
  } finally {
    loading.value = false
  }
}

function updatePreview(file) {
  if (imagePreview.value) {
    URL.revokeObjectURL(imagePreview.value)
  }
  imagePreview.value = URL.createObjectURL(file)
}

function formatDate(value) {
  if (!value) return '无'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(value)
}

function formatSize(size) {
  if (!size) return '无'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '无'
  return String(value)
}

function formatRawMetadata(key, value) {
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number(value.toFixed(8))
  }
  return value
}

onUnmounted(() => {
  if (imagePreview.value) {
    URL.revokeObjectURL(imagePreview.value)
  }
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

.file-name {
  color: #cbd5e1;
}

.status-panel,
.error-panel {
  padding: 16px;
  border-radius: 8px;
  background: rgba(0, 212, 255, 0.1);
}

.status-text {
  color: #00d4ff;
}

.error-panel {
  margin-top: 18px;
  background: rgba(239, 68, 68, 0.14);
  color: #fca5a5;
}

.metadata-layout {
  display: grid;
  grid-template-columns: minmax(260px, 420px) 1fr;
  gap: 24px;
  align-items: start;
}

.preview-section {
  min-width: 0;
}

.image-box {
  position: relative;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

.image-box img {
  display: block;
  width: 100%;
  max-height: 420px;
  object-fit: contain;
}

.image-label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px;
  background: rgba(0, 0, 0, 0.7);
  text-align: center;
  font-size: 0.9rem;
}

.metadata-panel {
  min-width: 0;
}

.metadata-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 8px;
  background: rgba(0, 212, 255, 0.1);
}

.summary-card strong {
  color: #00d4ff;
  font-size: 1.1rem;
}

.summary-card small,
.summary-label {
  color: #94a3b8;
}

.metadata-list {
  display: grid;
  gap: 10px;
}

.metadata-item {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.metadata-item__label {
  color: #94a3b8;
  flex: 0 0 88px;
}

.metadata-item__value {
  color: #f8fafc;
  text-align: right;
  overflow-wrap: anywhere;
}

.metadata-raw {
  margin-top: 22px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.metadata-raw__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.05);
}

.metadata-raw__header h3 {
  margin: 0;
  font-size: 1rem;
}

.metadata-raw__header span {
  color: #94a3b8;
  font-size: 0.9rem;
}

.metadata-raw pre {
  max-height: 360px;
  margin: 0;
  padding: 14px;
  overflow: auto;
  color: #dbeafe;
  font-size: 0.86rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 860px) {
  .metadata-layout,
  .metadata-summary {
    grid-template-columns: 1fr;
  }

  .metadata-item {
    flex-direction: column;
    gap: 6px;
  }

  .metadata-item__value {
    text-align: left;
  }
}
</style>
