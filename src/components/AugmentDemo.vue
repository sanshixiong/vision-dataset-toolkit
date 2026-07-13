<template>
  <div class="demo-panel">
    <h2>{{ title }}</h2>
    <p class="demo-desc">{{ description }}</p>

    <div class="demo-area">
      <!-- 上传区域 -->
      <div class="upload-section">
        <input type="file" accept="image/*" @change="handleUpload" ref="fileInput" />
        <button class="native-button native-button--primary" type="button" @click="$refs.fileInput.click()">
          选择图片
        </button>
        <span v-if="imageSrc" class="file-info">
          已选择: {{ fileName }}
        </span>
      </div>

      <!-- 配置区域 -->
      <div class="config-section" v-if="imageSrc">
        <div class="config-row">
          <div class="config-item">
            <label>增强策略</label>
            <select v-model="strategy" class="native-select native-select--wide">
              <option value="auto">自动组合</option>
              <option value="illumination">光照变化</option>
              <option value="geometric">几何变换</option>
              <option value="hsv">颜色调整</option>
              <option value="weather">雨雾效果</option>
              <option value="blur">模糊效果</option>
              <option value="noise">背景噪声</option>
            </select>
          </div>

          <div class="config-item">
            <label>增强数量</label>
            <input v-model.number="augmentCount" class="native-input native-input--number" type="number" min="1" max="20" />
          </div>

          <div class="config-item">
            <label>输出格式</label>
            <select v-model="outputFormat" class="native-select native-select--compact">
              <option value="jpeg">JPEG</option>
              <option value="png">PNG</option>
            </select>
          </div>
        </div>

        <div class="config-row">
          <div class="config-item checkbox-item">
            <label class="native-checkbox">
              <input v-model="enableIllumination" type="checkbox" />
              <span>光照变化</span>
            </label>
          </div>
          <div class="config-item checkbox-item">
            <label class="native-checkbox">
              <input v-model="enableGeometric" type="checkbox" />
              <span>几何变换</span>
            </label>
          </div>
          <div class="config-item checkbox-item">
            <label class="native-checkbox">
              <input v-model="enableHSV" type="checkbox" />
              <span>颜色调整</span>
            </label>
          </div>
          <div class="config-item checkbox-item">
            <label class="native-checkbox">
              <input v-model="enableWeather" type="checkbox" />
              <span>雨雾效果</span>
            </label>
          </div>
          <div class="config-item checkbox-item">
            <label class="native-checkbox">
              <input v-model="enableBlur" type="checkbox" />
              <span>模糊效果</span>
            </label>
          </div>
          <div class="config-item checkbox-item">
            <label class="native-checkbox">
              <input v-model="enableNoise" type="checkbox" />
              <span>背景噪声</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 预览区域 -->
      <div class="preview-section" v-if="imageSrc">
        <div class="preview-column">
          <div class="preview-title">原始图像</div>
          <div class="preview-box">
            <img :src="imageSrc" alt="原始图像" />
          </div>
        </div>

        <div class="preview-column" v-if="augmentedImage">
          <div class="preview-title">增强结果</div>
          <div class="preview-box">
            <img :src="augmentedImage" alt="增强结果" />
          </div>
          <div class="augment-info" v-if="currentMetadata">
            <span v-for="(op, idx) in currentMetadata.operations" :key="idx" class="tag">
              {{ getOpName(op) }}
            </span>
          </div>
        </div>
      </div>

      <!-- 批量预览 -->
      <div class="batch-preview" v-if="batchResults.length > 0">
        <div class="batch-header">
          <h4>批量增强结果 ({{ batchResults.length }}张)</h4>
          <div class="batch-actions">
            <button class="native-button native-button--primary native-button--small" type="button" @click="downloadAll">
              下载全部 (ZIP)
            </button>
          </div>
        </div>
        <div class="batch-grid">
          <div
            v-for="(item, idx) in batchResults"
            :key="idx"
            class="batch-item"
            :class="{ selected: selectedIndex === idx }"
            @click="selectResult(idx)"
          >
            <img :src="item.dataUrl" :alt="`增强 ${idx + 1}`" />
            <div class="batch-item-index">{{ idx + 1 }}</div>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="action-section" v-if="imageSrc">
        <button class="native-button native-button--success" type="button" :disabled="generating" @click="generateSingle">
          {{ generating ? '生成中...' : '预览单张' }}
        </button>
        <button class="native-button native-button--warning" type="button" :disabled="batchGenerating" @click="generateBatch">
          {{ batchGenerating ? '生成中...' : `批量生成 ${augmentCount} 张` }}
        </button>
        <button class="native-button" type="button" @click="reset">
          重置
        </button>
      </div>

      <!-- 进度显示 -->
      <div class="progress-section" v-if="batchGenerating">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: batchProgress + '%' }"></div>
        </div>
        <div class="progress-text">
          生成中... {{ batchProgress.toFixed(0) }}%
        </div>
      </div>

      <!-- 参数详情 -->
      <div class="params-section" v-if="showParams && currentMetadata">
        <h4>增强参数</h4>
        <pre class="params-json">{{ formatParams(currentMetadata.params) }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ImageAugmenter } from '@/utils/image-augmenter.js'

defineProps({
  title: {
    type: String,
    default: '样本增强'
  },
  description: {
    type: String,
    default: '图像增广：~20%特征波动，模拟光照变化、背景扰动、概率遮挡、雨雾效果'
  }
})

const fileInput = ref(null)
const imageSrc = ref('')
const fileName = ref('')
const augmentedImage = ref('')
const currentMetadata = ref(null)
const showParams = ref(false)

// 配置
const strategy = ref('auto')
const augmentCount = ref(5)
const outputFormat = ref('jpeg')

// 各策略开关（V2 新增）
const enableIllumination = ref(true)
const enableGeometric = ref(true)
const enableHSV = ref(true)
const enableWeather = ref(false)
const enableBlur = ref(false)
const enableNoise = ref(false)

// 批量结果
const batchResults = ref([])
const batchGenerating = ref(false)
const batchProgress = ref(0)
const generating = ref(false)
const selectedIndex = ref(-1)

const augmenter = new ImageAugmenter()
let originalImage = null

function handleUpload(e) {
  const file = e.target.files[0]
  if (!file) return

  fileName.value = file.name
  imageSrc.value = URL.createObjectURL(file)
  augmentedImage.value = ''
  currentMetadata.value = null
  batchResults.value = []
  selectedIndex.value = -1

  const img = new Image()
  img.onload = () => {
    originalImage = img
  }
  img.src = imageSrc.value
}

async function generateSingle() {
  if (!originalImage) return

  generating.value = true
  showParams.value = true

  try {
    // 生成随机配置
    const config = augmenter.generateConfig(strategy.value)

    // 根据开关限制配置
    applyConfigSwitches(config)

    const result = augmenter.augment(originalImage, config)
    augmentedImage.value = result.canvas.toDataURL(`image/${outputFormat.value}`, 0.92)
    currentMetadata.value = result.metadata
  } finally {
    generating.value = false
  }
}

/**
 * 应用开关限制到配置
 */
function applyConfigSwitches(config) {
  if (!enableIllumination.value) config.illumination = false
  if (!enableGeometric.value) config.geometric = false
  if (!enableHSV.value) config.hsv = false
  if (!enableWeather.value) config.weather = false
  if (!enableBlur.value) config.blur = false
  if (!enableNoise.value) config.noise = false
  
  // 确保至少有一个增强生效
  const hasAny = config.illumination || config.geometric || config.hsv || 
                 config.weather || config.blur || config.noise
  
  if (!hasAny && enableIllumination.value) {
    config.illumination = augmenter.randomIlluminationParams()
  }
}

async function generateBatch() {
  if (!originalImage) return

  batchGenerating.value = true
  batchProgress.value = 0
  batchResults.value = []

  try {
    const configs = augmenter.generateBatchConfigs(augmentCount.value, strategy.value)

    // 应用开关限制
    configs.forEach(config => {
      applyConfigSwitches(config)
    })

    const results = await augmenter.batchAugment(
      originalImage,
      configs,
      (current, total, config) => {
        batchProgress.value = (current / total) * 100
      }
    )

    batchResults.value = results

    // 自动选中第一张
    if (results.length > 0) {
      selectResult(0)
    }
  } finally {
    batchGenerating.value = false
  }
}

function selectResult(index) {
  selectedIndex.value = index
  const item = batchResults.value[index]
  if (item) {
    augmentedImage.value = item.dataUrl
    currentMetadata.value = item.metadata
    showParams.value = true
  }
}

function reset() {
  augmentedImage.value = ''
  currentMetadata.value = null
  batchResults.value = []
  selectedIndex.value = -1
  showParams.value = false
}

function getOpName(op) {
  const names = {
    illumination: '光照',
    geometric: '几何',
    hsv: '色彩',
    noise: '噪声',
    occlusion: '遮挡',
    weather: '雨雾',
    blur: '模糊',
    compression: '压缩'
  }
  return names[op] || op
}

function formatParams(params) {
  const formatted = {}

  for (const [key, value] of Object.entries(params)) {
    if (value === false || value === null) continue

    if (typeof value === 'object') {
      formatted[key] = {}
      for (const [k, v] of Object.entries(value)) {
        if (typeof v === 'number') {
          formatted[key][k] = v.toFixed(3)
        } else {
          formatted[key][k] = v
        }
      }
    }
  }

  return JSON.stringify(formatted, null, 2)
}

async function downloadAll() {
  if (batchResults.value.length === 0) return

  const JSZip = await import('jszip').then(m => m.default)
  const zip = new JSZip()

  batchResults.value.forEach((item, idx) => {
    const ext = outputFormat.value === 'jpeg' ? 'jpg' : 'png'
    // 转换 data URL 为 blob
    const data = item.dataUrl.split(',')[1]
    const binary = atob(data)
    const array = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i)
    }
    zip.file(`aug_${String(idx + 1).padStart(3, '0')}.${ext}`, array)
  })

  const content = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(content)
  const a = document.createElement('a')
  a.href = url
  a.download = `augmented_images_${Date.now()}.zip`
  a.click()
  URL.revokeObjectURL(url)
}
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
  margin-bottom: 20px;
}

.upload-section input[type="file"] {
  display: none;
}

.file-info {
  color: #00d4ff;
  font-size: 0.9rem;
}

.config-section {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 20px;
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

.checkbox-item {
  flex-direction: row;
  align-items: center;
}

.preview-section {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.preview-column {
  flex: 1;
  min-width: 300px;
}

.preview-title {
  color: #888;
  margin-bottom: 10px;
  font-size: 0.9rem;
}

.preview-box {
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}

.preview-box img {
  max-width: 100%;
  max-height: 350px;
  object-fit: contain;
}

.augment-info {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.tag {
  background: rgba(0, 212, 255, 0.2);
  color: #00d4ff;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.8rem;
}

.batch-preview {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.batch-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.batch-header h4 {
  margin: 0;
  color: #fff;
}

.batch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  max-height: 300px;
  overflow-y: auto;
}

.batch-item {
  position: relative;
  background: #000;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.batch-item:hover {
  border-color: rgba(0, 212, 255, 0.5);
}

.batch-item.selected {
  border-color: #00d4ff;
}

.batch-item img {
  width: 100%;
  height: 80px;
  object-fit: cover;
}

.batch-item-index {
  position: absolute;
  top: 5px;
  left: 5px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.7rem;
}

.action-section {
  display: flex;
  gap: 10px;
  margin-top: 20px;
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

.params-section {
  margin-top: 20px;
  padding: 15px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
}

.params-section h4 {
  margin: 0 0 10px 0;
  color: #888;
  font-size: 0.9rem;
}

.params-json {
  margin: 0;
  padding: 10px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.8rem;
  color: #00ff00;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
