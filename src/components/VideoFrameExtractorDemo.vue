<template>
  <div class="demo-panel">
    <h2>{{ title }}</h2>
    <p class="demo-desc">{{ description }}</p>

    <div class="demo-area">
      <div class="upload-section">
        <input ref="fileInput" type="file" accept="video/mp4,video/*" @change="handleUpload" />
        <el-button type="primary" @click="$refs.fileInput.click()">
          选择视频
        </el-button>
        <span v-if="videoFile" class="file-info">
          已选择: {{ videoFile.name }}（{{ formatSize(videoFile.size) }}）
        </span>
      </div>

      <div class="tip-panel">
        <div class="tip-panel__title">文件建议</div>
        <div class="tip-panel__text">
          浏览器端抽帧建议单个 MP4 控制在 {{ formatSize(recommendedMaxSize) }} 以内；超过 {{ formatSize(warningSize) }} 时仍可尝试，但 seek、解码和导出 ZIP 可能明显变慢。
        </div>
      </div>

      <div v-if="warningMessage" class="warning-panel">
        {{ warningMessage }}
      </div>

      <div v-if="videoUrl" class="video-section">
        <video ref="videoRef" :src="videoUrl" class="video-preview" controls preload="metadata" @loadedmetadata="handleMetadataLoaded"></video>
        <div class="video-meta" v-if="videoMeta.duration">
          <span>时长: {{ videoMeta.duration.toFixed(1) }} 秒</span>
          <span>分辨率: {{ videoMeta.width }}x{{ videoMeta.height }}</span>
        </div>
      </div>

      <div class="config-section" v-if="videoUrl">
        <div class="config-row">
          <div class="config-item">
            <label>抽帧间隔（秒）：{{ intervalSeconds }}</label>
            <input v-model.number="intervalSeconds" type="number" min="0.5" max="30" step="0.5" />
          </div>
          <div class="config-item">
            <label>最多帧数：{{ maxFrames }}</label>
            <input v-model.number="maxFrames" type="number" min="1" max="300" step="1" />
          </div>
          <div class="config-item">
            <label>输出宽度：{{ targetWidth }}</label>
            <input v-model.number="targetWidth" type="number" min="320" max="3840" step="160" />
          </div>
          <div class="config-item">
            <label>JPEG 质量：{{ jpegQuality.toFixed(2) }}</label>
            <input v-model.number="jpegQuality" type="range" min="0.5" max="0.95" step="0.05" />
          </div>
        </div>

        <div class="config-row">
          <div class="config-item checkbox-item">
            <label>
              <input v-model="skipBlankFrames" type="checkbox" />
              跳过黑屏/白屏帧
            </label>
          </div>
          <div class="config-item">
            <label>黑屏亮度阈值：{{ blackThreshold }}</label>
            <input v-model.number="blackThreshold" type="number" min="0" max="60" step="1" />
          </div>
          <div class="config-item">
            <label>白屏亮度阈值：{{ whiteThreshold }}</label>
            <input v-model.number="whiteThreshold" type="number" min="180" max="255" step="1" />
          </div>
          <div class="config-item">
            <label>低纹理方差阈值：{{ varianceThreshold }}</label>
            <input v-model.number="varianceThreshold" type="number" min="1" max="500" step="1" />
          </div>
        </div>
      </div>

      <div class="action-section" v-if="videoUrl">
        <el-button type="success" :loading="extracting" @click="extractFrames">
          开始抽帧
        </el-button>
        <el-button :disabled="frames.length === 0" @click="downloadFrames">
          下载抽帧结果 (ZIP)
        </el-button>
        <el-button @click="reset">
          重置
        </el-button>
      </div>

      <div class="progress-section" v-if="extracting">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progress + '%' }"></div>
        </div>
        <div class="progress-text">
          抽帧中... {{ progress.toFixed(0) }}%（{{ processedFrames }}/{{ plannedFrames }}）
        </div>
      </div>

      <div class="result-summary" v-if="summary.total > 0">
        <div class="summary-card success">
          <div class="summary-number">{{ frames.length }}</div>
          <div class="summary-label">保留帧</div>
        </div>
        <div class="summary-card warning">
          <div class="summary-number">{{ skippedFrames.length }}</div>
          <div class="summary-label">跳过帧</div>
        </div>
        <div class="summary-card">
          <div class="summary-number">{{ summary.total }}</div>
          <div class="summary-label">采样帧</div>
        </div>
      </div>

      <div class="frame-grid" v-if="frames.length > 0">
        <div v-for="frame in frames" :key="frame.name" class="frame-card">
          <img :src="frame.dataUrl" :alt="frame.name" />
          <div class="frame-card__meta">
            <span>{{ frame.name }}</span>
            <span>{{ frame.time.toFixed(2) }}s</span>
          </div>
        </div>
      </div>

      <div class="skipped-section" v-if="skippedFrames.length > 0">
        <h4>已跳过帧</h4>
        <div class="skipped-list">
          <div v-for="frame in skippedFrames.slice(0, 12)" :key="frame.name" class="skipped-item">
            <span>{{ frame.name }}</span>
            <span>{{ frame.reason }}，亮度 {{ frame.metrics.mean.toFixed(1) }}，方差 {{ frame.metrics.variance.toFixed(1) }}</span>
          </div>
          <div v-if="skippedFrames.length > 12" class="more-files">
            ... 还有 {{ skippedFrames.length - 12 }} 个跳过帧
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref } from 'vue'

defineProps({
  title: {
    type: String,
    default: '视频抽帧'
  },
  description: {
    type: String,
    default: '从 MP4 视频按时间间隔提取训练图片，并自动跳过疑似黑屏、白屏等无效帧'
  }
})

const recommendedMaxSize = 300 * 1024 * 1024
const warningSize = 500 * 1024 * 1024

const fileInput = ref(null)
const videoRef = ref(null)
const videoFile = ref(null)
const videoUrl = ref('')
const warningMessage = ref('')
const extracting = ref(false)
const progress = ref(0)
const processedFrames = ref(0)
const plannedFrames = ref(0)
const frames = ref([])
const skippedFrames = ref([])

const intervalSeconds = ref(2)
const maxFrames = ref(120)
const targetWidth = ref(1280)
const jpegQuality = ref(0.85)
const skipBlankFrames = ref(true)
const blackThreshold = ref(12)
const whiteThreshold = ref(242)
const varianceThreshold = ref(80)

const videoMeta = ref({
  duration: 0,
  width: 0,
  height: 0
})

const summary = computed(() => ({
  total: frames.value.length + skippedFrames.value.length
}))

function handleUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return

  resetResults()
  revokeVideoUrl()

  videoFile.value = file
  videoUrl.value = URL.createObjectURL(file)
  warningMessage.value = getFileWarning(file)
}

function handleMetadataLoaded() {
  const video = videoRef.value
  if (!video) return

  videoMeta.value = {
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    width: video.videoWidth,
    height: video.videoHeight
  }
}

async function extractFrames() {
  const video = videoRef.value
  if (!video || !videoMeta.value.duration) return

  extracting.value = true
  resetResults()

  const times = buildFrameTimes(videoMeta.value.duration)
  plannedFrames.value = times.length

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const outputSize = getOutputSize()
  canvas.width = outputSize.width
  canvas.height = outputSize.height

  try {
    for (let index = 0; index < times.length; index++) {
      const time = times[index]
      await seekVideo(video, time)

      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const metrics = analyzeFrame(context, canvas.width, canvas.height)
      const frameName = `frame_${String(index + 1).padStart(4, '0')}_${formatTimeForName(time)}.jpg`

      if (skipBlankFrames.value && isBlankFrame(metrics)) {
        skippedFrames.value.push({
          name: frameName,
          time,
          reason: metrics.mean <= blackThreshold.value ? '疑似黑屏' : '疑似白屏',
          metrics
        })
      } else {
        frames.value.push({
          name: frameName,
          time,
          dataUrl: canvas.toDataURL('image/jpeg', jpegQuality.value),
          metrics
        })
      }

      processedFrames.value = index + 1
      progress.value = (processedFrames.value / plannedFrames.value) * 100
      await nextFrame()
    }
  } finally {
    extracting.value = false
  }
}

async function downloadFrames() {
  if (frames.value.length === 0) return

  const JSZip = await import('jszip').then(module => module.default)
  const zip = new JSZip()

  frames.value.forEach(frame => {
    zip.file(frame.name, dataUrlToUint8Array(frame.dataUrl))
  })

  zip.file('frame-report.json', JSON.stringify({
    source: videoFile.value?.name || '',
    sourceSize: videoFile.value?.size || 0,
    intervalSeconds: intervalSeconds.value,
    outputSize: getOutputSize(),
    skipBlankFrames: skipBlankFrames.value,
    blankFrameRule: {
      blackThreshold: blackThreshold.value,
      whiteThreshold: whiteThreshold.value,
      varianceThreshold: varianceThreshold.value
    },
    keptFrames: frames.value.map(({ dataUrl, ...frame }) => frame),
    skippedFrames: skippedFrames.value
  }, null, 2))

  const content = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(content)
  const link = document.createElement('a')
  link.href = url
  link.download = `video_frames_${Date.now()}.zip`
  link.click()
  URL.revokeObjectURL(url)
}

function buildFrameTimes(duration) {
  const safeDuration = Math.max(0, duration - 0.05)
  const times = []

  for (let time = 0; time <= safeDuration && times.length < maxFrames.value; time += intervalSeconds.value) {
    times.push(Number(time.toFixed(3)))
  }

  if (times.length === 0 && duration > 0) {
    times.push(0)
  }

  return times
}

function getOutputSize() {
  const sourceWidth = videoMeta.value.width || targetWidth.value
  const sourceHeight = videoMeta.value.height || targetWidth.value
  const width = Math.min(targetWidth.value, sourceWidth)
  const height = Math.round(width * sourceHeight / sourceWidth)

  return { width, height }
}

function seekVideo(video, time) {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('视频 seek 失败'))
    }
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }

    video.addEventListener('seeked', onSeeked, { once: true })
    video.addEventListener('error', onError, { once: true })
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.05))
  })
}

function analyzeFrame(context, width, height) {
  const sampleSize = 64
  const sampleCanvas = document.createElement('canvas')
  const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true })
  sampleCanvas.width = sampleSize
  sampleCanvas.height = sampleSize
  sampleContext.drawImage(context.canvas, 0, 0, width, height, 0, 0, sampleSize, sampleSize)

  const data = sampleContext.getImageData(0, 0, sampleSize, sampleSize).data
  const luminanceValues = []
  let sum = 0

  for (let index = 0; index < data.length; index += 4) {
    const luminance = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    luminanceValues.push(luminance)
    sum += luminance
  }

  const mean = sum / luminanceValues.length
  const variance = luminanceValues.reduce((total, value) => total + Math.pow(value - mean, 2), 0) / luminanceValues.length

  return { mean, variance }
}

function isBlankFrame(metrics) {
  const lowTexture = metrics.variance <= varianceThreshold.value
  return lowTexture && (metrics.mean <= blackThreshold.value || metrics.mean >= whiteThreshold.value)
}

function dataUrlToUint8Array(dataUrl) {
  const data = dataUrl.split(',')[1]
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function getFileWarning(file) {
  if (file.size > warningSize) {
    return `当前视频超过 ${formatSize(warningSize)}，建议先裁剪视频片段或降低抽帧上限后再处理。`
  }

  if (file.size > recommendedMaxSize) {
    return `当前视频超过建议大小 ${formatSize(recommendedMaxSize)}，浏览器端处理可能较慢。`
  }

  return ''
}

function reset() {
  resetResults()
  videoFile.value = null
  videoMeta.value = { duration: 0, width: 0, height: 0 }
  warningMessage.value = ''
  revokeVideoUrl()
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

function resetResults() {
  frames.value = []
  skippedFrames.value = []
  progress.value = 0
  processedFrames.value = 0
  plannedFrames.value = 0
}

function revokeVideoUrl() {
  if (videoUrl.value) {
    URL.revokeObjectURL(videoUrl.value)
    videoUrl.value = ''
  }
}

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve))
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatTimeForName(time) {
  return time.toFixed(2).replace('.', 's')
}

onUnmounted(() => {
  revokeVideoUrl()
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

.upload-section,
.action-section {
  display: flex;
  align-items: center;
  gap: 15px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.upload-section input[type="file"] {
  display: none;
}

.file-info {
  color: #00d4ff;
  font-size: 0.9rem;
}

.tip-panel,
.warning-panel,
.config-section,
.skipped-section {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 20px;
}

.tip-panel__title {
  color: #00d4ff;
  font-weight: 600;
  margin-bottom: 6px;
}

.tip-panel__text {
  color: #aaa;
  line-height: 1.6;
}

.warning-panel {
  border: 1px solid rgba(255, 193, 7, 0.4);
  color: #ffc107;
}

.video-section {
  margin-bottom: 20px;
}

.video-preview {
  display: block;
  width: 100%;
  max-height: 420px;
  background: #000;
  border-radius: 8px;
}

.video-meta {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  color: #aaa;
  margin-top: 10px;
  font-size: 0.9rem;
}

.config-row {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 15px;
}

.config-row:last-child {
  margin-bottom: 0;
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.config-item label {
  color: #888;
  font-size: 0.85rem;
}

.config-item input[type="number"],
.config-item input[type="range"] {
  width: 150px;
}

.config-item input[type="number"] {
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid #333;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.config-item input[type="checkbox"] {
  margin-right: 8px;
}

.checkbox-item {
  justify-content: flex-end;
}

.checkbox-item label {
  display: flex;
  align-items: center;
  min-height: 36px;
}

.progress-section {
  margin-top: 20px;
}

.progress-bar {
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #00d4ff, #7b2cbf);
  transition: width 0.2s;
}

.progress-text {
  margin-top: 8px;
  color: #00d4ff;
  text-align: center;
  font-size: 0.9rem;
}

.result-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 15px;
  margin: 20px 0;
}

.summary-card {
  background: rgba(255, 255, 255, 0.05);
  padding: 20px;
  border-radius: 8px;
  text-align: center;
}

.summary-card.success {
  background: rgba(0, 255, 0, 0.1);
}

.summary-card.warning {
  background: rgba(255, 193, 7, 0.1);
}

.summary-number {
  font-size: 2rem;
  font-weight: bold;
  color: #00d4ff;
}

.summary-label {
  color: #aaa;
  margin-top: 5px;
}

.frame-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
  margin-top: 20px;
}

.frame-card {
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

.frame-card img {
  display: block;
  width: 100%;
  height: 120px;
  object-fit: cover;
}

.frame-card__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  color: #aaa;
  font-size: 0.75rem;
}

.skipped-section h4 {
  margin: 0 0 12px 0;
}

.skipped-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skipped-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #aaa;
  font-size: 0.85rem;
}

.more-files {
  color: #888;
  text-align: center;
  padding: 10px;
}
</style>