<template>
  <div class="demo-panel">
    <h2>{{ title }}</h2>
    <p class="demo-desc">{{ description }}</p>

    <div class="demo-area">
      <div class="upload-section">
        <el-button type="primary" @click="initializePreprocessor" :loading="loading">
          初始化预处理器
        </el-button>
        <span v-if="loaded" class="success-text">预处理器已就绪</span>
      </div>

      <div class="preview-section" v-if="imagePreview">
        <div class="image-box">
          <img :src="imagePreview" alt="待分类图像" />
          <div class="image-label">待分类图像</div>
        </div>
      </div>

      <div class="upload-section" v-if="loaded">
        <input type="file" accept="image/*" @change="handleUpload" ref="fileInput" />
        <el-button @click="$refs.fileInput.click()">选择图像</el-button>
        <el-button type="warning" @click="runPreprocess" :disabled="!imagePreview">
          运行预处理
        </el-button>
      </div>

      <div class="result-panel" v-if="preprocessResult">
        <h3>预处理结果</h3>
        <div class="result-item">
          <span class="label">Tensor 维度:</span>
          <span class="value">{{ preprocessResult.dims.join(' × ') }}</span>
        </div>
        <div class="result-item">
          <span class="label">像素通道数:</span>
          <span class="value confidence">{{ preprocessResult.tensorLength.toLocaleString() }}</span>
        </div>
        <div class="result-item">
          <span class="label">处理耗时:</span>
          <span class="value">{{ preprocessResult.processingTime.toFixed(2) }} ms</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { WebNNRunner } from '@/utils/webnn-runner.js'

defineProps({
  title: {
    type: String,
    default: '图像预处理体检'
  },
  description: {
    type: String,
    default: '验证图片缩放、归一化与 Tensor 转换耗时，为训练数据质检提供基础处理能力'
  }
})

const fileInput = ref(null)
const imagePreview = ref('')
const loading = ref(false)
const loaded = ref(false)
const preprocessResult = ref(null)

const webnnRunner = new WebNNRunner()
let currentImageSrc = ''

async function initializePreprocessor() {
  loading.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, 300))
    loaded.value = true
    console.log('预处理器初始化成功')
  } catch (error) {
    console.error('预处理器初始化失败')
  } finally {
    loading.value = false
  }
}

function handleUpload(e) {
  const file = e.target.files[0]
  if (!file) return

  imagePreview.value = URL.createObjectURL(file)
  currentImageSrc = imagePreview.value
  preprocessResult.value = null
}

async function runPreprocess() {
  if (!currentImageSrc) return

  const img = new Image()
  img.onload = async () => {
    const startTime = performance.now()
    const { tensor, dims } = webnnRunner.preprocessImage(img, [224, 224])

    preprocessResult.value = {
      dims,
      tensorLength: tensor.length,
      processingTime: performance.now() - startTime
    }
  }
  img.src = currentImageSrc
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
  margin-bottom: 25px;
}

.upload-section input[type="file"] {
  display: none;
}

.success-text {
  color: #00ff00;
  margin-left: 15px;
}

.preview-section {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.image-box {
  position: relative;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

.image-box img {
  display: block;
  max-width: 100%;
  max-height: 400px;
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

.result-panel {
  background: rgba(0, 212, 255, 0.1);
  padding: 20px;
  border-radius: 8px;
  margin-top: 20px;
}

.result-panel h3 {
  margin-bottom: 15px;
}

.result-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.confidence {
  color: #00ff00;
}
</style>
