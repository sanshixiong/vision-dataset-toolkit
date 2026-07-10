/**
 * 高保真图像增强器 V2 - 前端样本增强工具
 * 适用于工业视觉场景的真实数据增强
 * 
 * V2 改进：
 * 1. 光照变化 - Gamma校正 + 局部光照渐变
 * 2. 几何变换 - 旋转、缩放、透视、翻转
 * 3. HSV颜色增强 - 色调/饱和度/明度独立调整
 * 4. 雾气效果 - 基于大气散射模型的真实雾气
 * 5. 模糊效果 - 高斯模糊、运动模糊
 * 6. JPEG压缩模拟 - 模拟不同质量的压缩伪影
 */

export class ImageAugmenter {
  constructor() {
    this.canvas = document.createElement('canvas')
    this.ctx = this.canvas.getContext('2d')
    // 辅助 canvas 用于几何变换
    this.tempCanvas = document.createElement('canvas')
    this.tempCtx = this.tempCanvas.getContext('2d')
  }

  /**
   * 应用所有增强策略
   */
  augment(imageElement, options = {}) {
    const { width, height } = imageElement

    this.canvas.width = width
    this.canvas.height = height
    this.ctx.clearRect(0, 0, width, height)
    this.ctx.drawImage(imageElement, 0, 0)

    const metadata = {
      operations: [],
      params: {},
      seed: Date.now()
    }

    // 1. 几何变换（优先执行，避免其他效果被裁剪）
    if (options.geometric) {
      const geoResult = this.applyGeometricTransform(options.geometric)
      metadata.operations.push('geometric')
      metadata.params.geometric = geoResult
    }

    // 2. HSV 颜色增强
    if (options.hsv) {
      const hsvResult = this.applyHSVAugmentation(options.hsv)
      metadata.operations.push('hsv')
      metadata.params.hsv = hsvResult
    }

    // 3. 光照变化（物理真实模型）
    if (options.illumination !== false && options.illumination) {
      const illuminationResult = this.applyRealisticIllumination(options.illumination)
      metadata.operations.push('illumination')
      metadata.params.illumination = illuminationResult
    }

    // 4. 背景扰动（噪声）
    if (options.noise !== false && options.noise) {
      const noiseResult = this.applyRealisticNoise(options.noise)
      metadata.operations.push('noise')
      metadata.params.noise = noiseResult
    }

    // 5. 概率遮挡（带防判重）
    if (options.occlusion !== false && options.occlusion) {
      const occlusionResult = this.applyRealisticOcclusion(options.occlusion, metadata.seed)
      metadata.operations.push('occlusion')
      metadata.params.occlusion = occlusionResult
    }

    // 6. 雨雾效果（大气散射模型）
    if (options.weather !== false && options.weather) {
      const weatherResult = this.applyRealisticWeather(options.weather)
      metadata.operations.push('weather')
      metadata.params.weather = weatherResult
    }

    // 7. 模糊效果
    if (options.blur) {
      const blurResult = this.applyBlur(options.blur)
      metadata.operations.push('blur')
      metadata.params.blur = blurResult
    }

    // 8. JPEG 压缩模拟
    if (options.compression) {
      const compResult = this.applyJPEGCompression(options.compression)
      metadata.operations.push('compression')
      metadata.params.compression = compResult
    }

    return {
      canvas: this.canvas,
      imageData: this.ctx.getImageData(0, 0, width, height),
      metadata
    }
  }

  /**
   * 生成单个增强配置
   * @param {string} strategy - 策略类型: auto|illumination|geometric|hsv|weather|blur
   */
  generateConfig(strategy = 'auto') {
    const configs = {
      illumination: false,
      noise: false,
      occlusion: false,
      weather: false,
      geometric: false,
      hsv: false,
      blur: false,
      compression: false
    }

    switch (strategy) {
      case 'illumination':
        configs.illumination = this.randomIlluminationParams()
        break
      case 'noise':
        configs.noise = this.randomNoiseParams()
        break
      case 'occlusion':
        configs.occlusion = this.randomOcclusionParams()
        break
      case 'weather':
        configs.weather = this.randomWeatherParams()
        break
      case 'geometric':
        configs.geometric = this.randomGeometricParams()
        break
      case 'hsv':
        configs.hsv = this.randomHSVParams()
        break
      case 'blur':
        configs.blur = this.randomBlurParams()
        break
      case 'auto':
      default:
        // 智能组合：随机选择2-3种互补增强
        const groups = {
          color: ['illumination', 'hsv'],      // 颜色类增强
          spatial: ['geometric'],              // 空间类增强
          degradation: ['noise', 'blur', 'weather'],  // 退化类增强
          occlusion: ['occlusion']             // 遮挡类增强
        }
        
        // 每组最多选一个，总共选 2-3 个
        const selected = []
        const groupKeys = Object.keys(groups)
        const numOps = Math.random() < 0.5 ? 2 : 3
        
        // 打乱组顺序
        const shuffledGroups = this.shuffle(groupKeys)
        
        for (const group of shuffledGroups) {
          if (selected.length >= numOps) break
          if (Math.random() < 0.7) { // 70% 概率选择该组
            const ops = groups[group]
            const op = ops[Math.floor(Math.random() * ops.length)]
            selected.push(op)
          }
        }
        
        // 确保至少有一个增强
        if (selected.length === 0) {
          selected.push('illumination')
        }

        selected.forEach(op => {
          switch (op) {
            case 'illumination':
              configs.illumination = this.randomIlluminationParams()
              break
            case 'noise':
              configs.noise = this.randomNoiseParams()
              break
            case 'occlusion':
              configs.occlusion = this.randomOcclusionParams()
              break
            case 'weather':
              configs.weather = this.randomWeatherParams()
              break
            case 'geometric':
              configs.geometric = this.randomGeometricParams()
              break
            case 'hsv':
              configs.hsv = this.randomHSVParams()
              break
            case 'blur':
              configs.blur = this.randomBlurParams()
              break
          }
        })
        break
    }

    return configs
  }

  generateBatchConfigs(count, strategy = 'auto') {
    return Array.from({ length: count }, () => this.generateConfig(strategy))
  }

  // ========== 新增：几何变换 ==========

  /**
   * 随机几何变换参数
   * 支持：旋转、缩放、平移、透视、翻转
   */
  randomGeometricParams() {
    return {
      rotate: this.randomInRange(-15, 15),        // 旋转角度（度）
      scale: this.randomInRange(0.9, 1.1),        // 缩放比例
      translateX: this.randomInRange(-0.05, 0.05), // 水平平移（相对宽度）
      translateY: this.randomInRange(-0.05, 0.05), // 垂直平移（相对高度）
      flipH: Math.random() < 0.3,                 // 水平翻转概率 30%
      flipV: false,                               // 垂直翻转（通常不用）
      perspective: Math.random() < 0.3 ? this.randomInRange(0.02, 0.06) : 0  // 透视强度
    }
  }

  applyGeometricTransform(params) {
    if (!params) return null

    const { width, height } = this.canvas
    const { rotate, scale, translateX, translateY, flipH, flipV, perspective } = params

    // 使用临时 canvas 存储原图
    this.tempCanvas.width = width
    this.tempCanvas.height = height
    this.tempCtx.drawImage(this.canvas, 0, 0)

    // 清空主 canvas
    this.ctx.clearRect(0, 0, width, height)

    // 设置变换中心点
    const centerX = width / 2
    const centerY = height / 2

    this.ctx.save()
    this.ctx.translate(centerX, centerY)

    // 翻转
    if (flipH) this.ctx.scale(-1, 1)
    if (flipV) this.ctx.scale(1, -1)

    // 旋转
    this.ctx.rotate((rotate * Math.PI) / 180)

    // 缩放
    this.ctx.scale(scale, scale)

    // 平移
    this.ctx.translate(translateX * width, translateY * height)

    // 绘制变换后的图像
    this.ctx.drawImage(this.tempCanvas, -centerX, -centerY)
    this.ctx.restore()

    // 透视变换（简化模拟）
    if (perspective > 0) {
      this.applyPerspective(perspective)
    }

    return params
  }

  /**
   * 简化的透视变换效果
   */
  applyPerspective(intensity) {
    const { width, height } = this.canvas
    const imageData = this.ctx.getImageData(0, 0, width, height)
    const srcData = new Uint8ClampedArray(imageData.data)
    const { data } = imageData

    // 清空原数据
    data.fill(0)

    for (let y = 0; y < height; y++) {
      // 根据 y 位置计算水平缩放因子（模拟透视）
      const perspectiveFactor = 1 - (y / height) * intensity * 2
      const scaledWidth = width * perspectiveFactor
      const offsetX = (width - scaledWidth) / 2

      for (let x = 0; x < width; x++) {
        // 计算源坐标
        const srcX = Math.floor((x - offsetX) / perspectiveFactor)
        
        if (srcX >= 0 && srcX < width) {
          const srcIdx = (y * width + srcX) * 4
          const dstIdx = (y * width + x) * 4

          data[dstIdx] = srcData[srcIdx]
          data[dstIdx + 1] = srcData[srcIdx + 1]
          data[dstIdx + 2] = srcData[srcIdx + 2]
          data[dstIdx + 3] = srcData[srcIdx + 3]
        }
      }
    }

    this.ctx.putImageData(imageData, 0, 0)
  }

  // ========== 新增：HSV 颜色增强 ==========

  /**
   * HSV 随机参数
   */
  randomHSVParams() {
    return {
      hueShift: this.randomInRange(-15, 15),        // 色调偏移（度）
      saturationScale: this.randomInRange(0.8, 1.3), // 饱和度缩放
      valueScale: this.randomInRange(0.85, 1.15)     // 明度缩放
    }
  }

  applyHSVAugmentation(params) {
    if (!params) return null

    const { hueShift, saturationScale, valueScale } = params
    const { width, height } = this.canvas
    const imageData = this.ctx.getImageData(0, 0, width, height)
    const { data } = imageData

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      // RGB 转 HSV
      let [h, s, v] = this.rgbToHsv(r, g, b)

      // 应用变换
      h = (h + hueShift / 360 + 1) % 1
      s = Math.max(0, Math.min(1, s * saturationScale))
      v = Math.max(0, Math.min(1, v * valueScale))

      // HSV 转 RGB
      const [nr, ng, nb] = this.hsvToRgb(h, s, v)

      data[i] = nr
      data[i + 1] = ng
      data[i + 2] = nb
    }

    this.ctx.putImageData(imageData, 0, 0)
    return params
  }

  rgbToHsv(r, g, b) {
    r /= 255
    g /= 255
    b /= 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min

    let h = 0
    const s = max === 0 ? 0 : d / max
    const v = max

    if (max !== min) {
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6
          break
        case g:
          h = ((b - r) / d + 2) / 6
          break
        case b:
          h = ((r - g) / d + 4) / 6
          break
      }
    }

    return [h, s, v]
  }

  hsvToRgb(h, s, v) {
    let r, g, b

    const i = Math.floor(h * 6)
    const f = h * 6 - i
    const p = v * (1 - s)
    const q = v * (1 - f * s)
    const t = v * (1 - (1 - f) * s)

    switch (i % 6) {
      case 0: r = v; g = t; b = p; break
      case 1: r = q; g = v; b = p; break
      case 2: r = p; g = v; b = t; break
      case 3: r = p; g = q; b = v; break
      case 4: r = t; g = p; b = v; break
      case 5: r = v; g = p; b = q; break
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
  }

  // ========== 新增：模糊效果 ==========

  randomBlurParams() {
    const types = ['gaussian', 'motion']
    return {
      type: types[Math.floor(Math.random() * types.length)],
      radius: this.randomInRange(1, 3),
      angle: this.randomInRange(0, 180)  // 运动模糊方向
    }
  }

  applyBlur(params) {
    if (!params) return null

    const { type, radius, angle } = params

    switch (type) {
      case 'gaussian':
        this.applyGaussianBlur(radius)
        break
      case 'motion':
        this.applyMotionBlur(radius, angle)
        break
    }

    return params
  }

  /**
   * 高斯模糊 - 使用可分离卷积优化
   */
  applyGaussianBlur(radius) {
    const { width, height } = this.canvas
    const imageData = this.ctx.getImageData(0, 0, width, height)
    const { data } = imageData

    // 生成高斯核
    const kernel = this.generateGaussianKernel(radius)
    const kernelSize = kernel.length
    const halfKernel = Math.floor(kernelSize / 2)

    // 临时存储
    const temp = new Float32Array(width * height * 4)

    // 水平模糊
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0
        for (let k = 0; k < kernelSize; k++) {
          const px = Math.min(width - 1, Math.max(0, x + k - halfKernel))
          const idx = (y * width + px) * 4
          const weight = kernel[k]
          r += data[idx] * weight
          g += data[idx + 1] * weight
          b += data[idx + 2] * weight
          a += data[idx + 3] * weight
        }
        const outIdx = (y * width + x) * 4
        temp[outIdx] = r
        temp[outIdx + 1] = g
        temp[outIdx + 2] = b
        temp[outIdx + 3] = a
      }
    }

    // 垂直模糊
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0
        for (let k = 0; k < kernelSize; k++) {
          const py = Math.min(height - 1, Math.max(0, y + k - halfKernel))
          const idx = (py * width + x) * 4
          const weight = kernel[k]
          r += temp[idx] * weight
          g += temp[idx + 1] * weight
          b += temp[idx + 2] * weight
          a += temp[idx + 3] * weight
        }
        const outIdx = (y * width + x) * 4
        data[outIdx] = Math.round(r)
        data[outIdx + 1] = Math.round(g)
        data[outIdx + 2] = Math.round(b)
        data[outIdx + 3] = Math.round(a)
      }
    }

    this.ctx.putImageData(imageData, 0, 0)
  }

  generateGaussianKernel(radius) {
    const sigma = radius / 2
    const size = Math.ceil(radius * 2) + 1
    const kernel = new Array(size)
    let sum = 0

    for (let i = 0; i < size; i++) {
      const x = i - Math.floor(size / 2)
      kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma))
      sum += kernel[i]
    }

    // 归一化
    for (let i = 0; i < size; i++) {
      kernel[i] /= sum
    }

    return kernel
  }

  /**
   * 运动模糊
   */
  applyMotionBlur(radius, angle) {
    const { width, height } = this.canvas
    const imageData = this.ctx.getImageData(0, 0, width, height)
    const srcData = new Uint8ClampedArray(imageData.data)
    const { data } = imageData

    const rad = (angle * Math.PI) / 180
    const dx = Math.cos(rad)
    const dy = Math.sin(rad)
    const samples = Math.ceil(radius * 2) + 1

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, count = 0

        for (let i = -radius; i <= radius; i++) {
          const px = Math.round(x + dx * i)
          const py = Math.round(y + dy * i)

          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 4
            r += srcData[idx]
            g += srcData[idx + 1]
            b += srcData[idx + 2]
            count++
          }
        }

        const outIdx = (y * width + x) * 4
        data[outIdx] = Math.round(r / count)
        data[outIdx + 1] = Math.round(g / count)
        data[outIdx + 2] = Math.round(b / count)
      }
    }

    this.ctx.putImageData(imageData, 0, 0)
  }

  // ========== 新增：JPEG 压缩模拟 ==========

  applyJPEGCompression(params) {
    const quality = params.quality || this.randomInRange(0.5, 0.85)
    
    // 使用 canvas 的 toDataURL 模拟 JPEG 压缩
    const dataUrl = this.canvas.toDataURL('image/jpeg', quality)
    
    // 创建临时图像加载压缩后的数据
    const img = new Image()
    img.src = dataUrl
    
    // 由于是同步操作，这里简化处理：添加块状伪影模拟
    this.addBlockArtifacts(quality)
    
    return { quality }
  }

  addBlockArtifacts(quality) {
    if (quality > 0.7) return // 高质量不添加伪影

    const { width, height } = this.canvas
    const imageData = this.ctx.getImageData(0, 0, width, height)
    const { data } = imageData

    const blockSize = 8
    const artifactStrength = (1 - quality) * 5

    for (let by = 0; by < height; by += blockSize) {
      for (let bx = 0; bx < width; bx += blockSize) {
        // 每个块添加轻微的颜色偏移
        const shift = (Math.random() - 0.5) * artifactStrength

        for (let y = by; y < Math.min(by + blockSize, height); y++) {
          for (let x = bx; x < Math.min(bx + blockSize, width); x++) {
            const idx = (y * width + x) * 4
            data[idx] = Math.max(0, Math.min(255, data[idx] + shift))
            data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + shift))
            data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + shift))
          }
        }
      }
    }

    this.ctx.putImageData(imageData, 0, 0)
  }

  // ========== 1. 改进的光照变化 ==========

  /**
   * 光照场景类型 - V2 改进版
   * 使用 Gamma 校正 + 局部渐变实现更真实的效果
   */
  randomIlluminationParams() {
    const scenes = ['dawn', 'noon', 'cloudy', 'dusk', 'shadow', 'spotlight', 'gradient']
    const scene = scenes[Math.floor(Math.random() * scenes.length)]

    const params = {
      scene,
      gamma: 1,                    // Gamma 校正值
      brightness: 0,               // 亮度偏移
      contrast: 1,                 // 对比度
      colorShift: { r: 1, g: 1, b: 1 },
      vignette: 0,
      localLight: null             // 局部光照参数
    }

    switch (scene) {
      case 'dawn':
        // 晨曦：暖黄色调，Gamma 偏亮，柔和
        params.gamma = this.randomInRange(0.9, 1.1)
        params.brightness = this.randomInRange(-10, 10)
        params.contrast = this.randomInRange(0.9, 1.0)
        params.colorShift = { r: 1.08, g: 1.02, b: 0.88 }
        params.vignette = this.randomInRange(0.08, 0.15)
        break

      case 'noon':
        // 正午：高亮度，Gamma 偏低增加对比
        params.gamma = this.randomInRange(0.85, 0.95)
        params.brightness = this.randomInRange(10, 25)
        params.contrast = this.randomInRange(1.05, 1.15)
        params.colorShift = { r: 1.0, g: 1.0, b: 0.98 }
        params.localLight = {
          type: 'highlight',
          x: this.randomInRange(0.3, 0.7),
          y: this.randomInRange(0.2, 0.4),
          radius: this.randomInRange(0.3, 0.5),
          intensity: this.randomInRange(0.1, 0.2)
        }
        break

      case 'cloudy':
        // 阴天：低对比，偏冷，整体暗
        params.gamma = this.randomInRange(1.05, 1.15)
        params.brightness = this.randomInRange(-20, -5)
        params.contrast = this.randomInRange(0.85, 0.95)
        params.colorShift = { r: 0.95, g: 0.97, b: 1.06 }
        params.vignette = this.randomInRange(0.05, 0.12)
        break

      case 'dusk':
        // 傍晚：暖橙色，渐变光照
        params.gamma = this.randomInRange(1.0, 1.1)
        params.brightness = this.randomInRange(-15, 5)
        params.contrast = this.randomInRange(0.95, 1.05)
        params.colorShift = { r: 1.12, g: 0.95, b: 0.82 }
        params.vignette = this.randomInRange(0.12, 0.22)
        params.localLight = {
          type: 'gradient',
          direction: 'horizontal',
          intensity: this.randomInRange(0.1, 0.2)
        }
        break

      case 'shadow':
        // 阴影区：整体偏暗，蓝色调
        params.gamma = this.randomInRange(1.15, 1.3)
        params.brightness = this.randomInRange(-30, -15)
        params.contrast = this.randomInRange(0.9, 1.05)
        params.colorShift = { r: 0.92, g: 0.95, b: 1.08 }
        params.vignette = this.randomInRange(0.15, 0.25)
        break

      case 'spotlight':
        // 聚光灯效果：局部高亮
        params.gamma = this.randomInRange(0.95, 1.05)
        params.brightness = this.randomInRange(-10, 5)
        params.contrast = this.randomInRange(1.0, 1.1)
        params.colorShift = { r: 1.02, g: 1.0, b: 0.98 }
        params.localLight = {
          type: 'spotlight',
          x: this.randomInRange(0.3, 0.7),
          y: this.randomInRange(0.3, 0.7),
          radius: this.randomInRange(0.2, 0.4),
          intensity: this.randomInRange(0.2, 0.35)
        }
        break

      case 'gradient':
        // 渐变光照：模拟窗户光
        params.gamma = 1
        params.brightness = 0
        params.contrast = 1
        params.localLight = {
          type: 'gradient',
          direction: Math.random() < 0.5 ? 'horizontal' : 'vertical',
          intensity: this.randomInRange(0.15, 0.3)
        }
        break
    }

    return params
  }

  applyRealisticIllumination(params) {
    if (!params) return null

    const { width, height } = this.canvas
    const imageData = this.ctx.getImageData(0, 0, width, height)
    const { data } = imageData

    const { gamma, brightness, contrast, colorShift } = params

    // 预计算 Gamma 查找表（性能优化）
    const gammaLUT = new Uint8Array(256)
    for (let i = 0; i < 256; i++) {
      gammaLUT[i] = Math.round(Math.pow(i / 255, gamma) * 255)
    }

    // 应用像素级变换
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i]
      let g = data[i + 1]
      let b = data[i + 2]

      // 1. Gamma 校正
      r = gammaLUT[r]
      g = gammaLUT[g]
      b = gammaLUT[b]

      // 2. 亮度调整
      r += brightness
      g += brightness
      b += brightness

      // 3. 对比度调整（围绕128）
      r = (r - 128) * contrast + 128
      g = (g - 128) * contrast + 128
      b = (b - 128) * contrast + 128

      // 4. 色温偏移
      r *= colorShift.r
      g *= colorShift.g
      b *= colorShift.b

      data[i] = Math.max(0, Math.min(255, Math.round(r)))
      data[i + 1] = Math.max(0, Math.min(255, Math.round(g)))
      data[i + 2] = Math.max(0, Math.min(255, Math.round(b)))
    }

    this.ctx.putImageData(imageData, 0, 0)

    // 应用暗角
    if (params.vignette > 0) {
      this.applyVignette(params.vignette)
    }

    // 应用局部光照
    if (params.localLight) {
      this.applyLocalLight(params.localLight)
    }

    return params
  }

  /**
   * 局部光照效果
   */
  applyLocalLight(params) {
    const { width, height } = this.canvas
    const { type, intensity } = params

    switch (type) {
      case 'spotlight': {
        const { x, y, radius } = params
        const centerX = width * x
        const centerY = height * y
        const r = Math.max(width, height) * radius

        const gradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, r)
        gradient.addColorStop(0, `rgba(255, 250, 240, ${intensity})`)
        gradient.addColorStop(0.5, `rgba(255, 250, 240, ${intensity * 0.3})`)
        gradient.addColorStop(1, 'rgba(255, 250, 240, 0)')

        this.ctx.fillStyle = gradient
        this.ctx.fillRect(0, 0, width, height)
        break
      }

      case 'highlight': {
        const { x, y, radius } = params
        const centerX = width * x
        const centerY = height * y
        const r = Math.max(width, height) * radius

        // 模拟过曝高光
        const gradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, r)
        gradient.addColorStop(0, `rgba(255, 255, 255, ${intensity * 0.5})`)
        gradient.addColorStop(0.3, `rgba(255, 255, 250, ${intensity * 0.2})`)
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

        this.ctx.fillStyle = gradient
        this.ctx.fillRect(0, 0, width, height)
        break
      }

      case 'gradient': {
        const { direction } = params
        let gradient

        if (direction === 'horizontal') {
          gradient = this.ctx.createLinearGradient(0, 0, width, 0)
          gradient.addColorStop(0, `rgba(255, 250, 240, ${intensity})`)
          gradient.addColorStop(0.5, 'rgba(255, 250, 240, 0)')
          gradient.addColorStop(1, `rgba(20, 30, 50, ${intensity * 0.5})`)
        } else {
          gradient = this.ctx.createLinearGradient(0, 0, 0, height)
          gradient.addColorStop(0, `rgba(255, 250, 240, ${intensity})`)
          gradient.addColorStop(0.5, 'rgba(255, 250, 240, 0)')
          gradient.addColorStop(1, `rgba(20, 30, 50, ${intensity * 0.5})`)
        }

        this.ctx.fillStyle = gradient
        this.ctx.fillRect(0, 0, width, height)
        break
      }
    }
  }

  applyVignette(intensity) {
    const { width, height } = this.canvas
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.max(width, height) * 0.7

    const imageData = this.ctx.getImageData(0, 0, width, height)
    const { data } = imageData

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        const dx = x - centerX
        const dy = y - centerY
        const dist = Math.sqrt(dx * dx + dy * dy) / radius

        // 平滑的暗角衰减
        const vignetteFactor = 1 - Math.pow(Math.min(dist, 1), 2) * intensity
        const darkening = Math.pow(vignetteFactor, 1.5)

        data[idx] = Math.floor(data[idx] * darkening)
        data[idx + 1] = Math.floor(data[idx + 1] * darkening)
        data[idx + 2] = Math.floor(data[idx + 2] * darkening)
      }
    }

    this.ctx.putImageData(imageData, 0, 0)
  }

  applyLensFlare(intensity) {
    const { width, height } = this.canvas

    // 在角落添加柔和的光晕
    const corners = [
      { x: width * 0.9, y: height * 0.1 },
      { x: width * 0.1, y: height * 0.9 }
    ]

    corners.forEach(corner => {
      const gradient = this.ctx.createRadialGradient(
        corner.x, corner.y, 0,
        corner.x, corner.y, Math.min(width, height) * 0.4
      )
      gradient.addColorStop(0, `rgba(255, 255, 220, ${intensity * 0.3})`)
      gradient.addColorStop(0.3, `rgba(255, 255, 200, ${intensity * 0.15})`)
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

      this.ctx.fillStyle = gradient
      this.ctx.fillRect(0, 0, width, height)
    })
  }

  // ========== 2. 真实色温偏移 ==========

  randomTemperatureParams() {
    // 模拟相机白平衡误差
    return {
      warm: this.randomInRange(-0.1, 0.15),  // 暖色调偏移
      cool: this.randomInRange(-0.1, 0.1)     // 冷色调偏移
    }
  }

  applyColorTemperature(params) {
    if (!params || params === true) {
      params = this.randomTemperatureParams()
    }

    const { width, height } = this.canvas
    const imageData = this.ctx.getImageData(0, 0, width, height)
    const { data } = imageData

    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.max(0, Math.min(255, data[i] * (1 + params.warm)))
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * (1 + params.cool)))
    }

    this.ctx.putImageData(imageData, 0, 0)
    return params
  }

  // ========== 3. 真实噪声注入 ==========

  randomNoiseParams() {
    return {
      type: ['gaussian', 'film', 'digital'][Math.floor(Math.random() * 3)],
      intensity: this.randomInRange(8, 18)
    }
  }

  applyRealisticNoise(params) {
    if (!params) return null

    const { type = 'gaussian', intensity = 10 } = params
    const { width, height } = this.canvas
    const imageData = this.ctx.getImageData(0, 0, width, height)
    const { data } = imageData

    switch (type) {
      case 'gaussian':
        this.applyGaussianNoise(data, intensity)
        break
      case 'film':
        this.applyFilmGrain(data, intensity)
        break
      case 'digital':
        this.applyDigitalNoise(data, intensity)
        break
    }

    this.ctx.putImageData(imageData, 0, 0)
    return { type, intensity }
  }

  applyGaussianNoise(data, intensity) {
    for (let i = 0; i < data.length; i += 4) {
      const noise = this.gaussianRandom() * intensity
      data[i] = Math.max(0, Math.min(255, data[i] + noise))
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise))
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise))
    }
  }

  applyFilmGrain(data, intensity) {
    // 胶片颗粒：更细腻，偏向中间色调
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * intensity * 1.5
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3
      // 暗部和高光颗粒较少，中间调颗粒较多
      const grainFactor = Math.sin((avg / 255) * Math.PI) * 1.5
      const grain = noise * grainFactor

      data[i] = Math.max(0, Math.min(255, data[i] + grain))
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + grain))
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + grain))
    }
  }

  applyDigitalNoise(data, intensity) {
    // 数字噪声：均匀分布，更明显的颗粒感
    for (let i = 0; i < data.length; i += 4) {
      const noiseR = (Math.random() - 0.5) * intensity * 2
      const noiseG = (Math.random() - 0.5) * intensity * 2
      const noiseB = (Math.random() - 0.5) * intensity * 2

      data[i] = Math.max(0, Math.min(255, data[i] + noiseR))
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noiseG))
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noiseB))
    }
  }

  // ========== 4. 真实雨雾效果 ==========

  // ========== 4. 改进的雨雾效果（大气散射模型）==========

  /**
   * 天气类型 - V2 使用大气散射物理模型
   * 基于 Koschmieder 定律: I = I0 * e^(-βd) + A * (1 - e^(-βd))
   * 其中 β 是大气散射系数，d 是深度，A 是大气光照
   */
  randomWeatherParams() {
    const types = ['atmospheric_fog', 'distance_fog', 'rain', 'haze']
    const type = types[Math.floor(Math.random() * types.length)]

    const params = {
      type,
      beta: 0,           // 散射系数
      atmosphericLight: [200, 210, 220],  // 大气光颜色
      depthScale: 1,     // 深度缩放
      rainIntensity: 0   // 雨滴强度
    }

    switch (type) {
      case 'atmospheric_fog':
        // 大气雾：基于距离的指数衰减
        params.beta = this.randomInRange(1.5, 3.0)
        params.atmosphericLight = [
          Math.round(200 + Math.random() * 30),
          Math.round(210 + Math.random() * 25),
          Math.round(220 + Math.random() * 20)
        ]
        params.depthScale = this.randomInRange(0.8, 1.2)
        break

      case 'distance_fog':
        // 距离雾：从下往上的渐变雾
        params.beta = this.randomInRange(2.0, 4.0)
        params.atmosphericLight = [220, 225, 235]
        params.depthScale = this.randomInRange(0.5, 1.0)
        break

      case 'rain':
        // 雨天：轻微雾气 + 雨滴
        params.beta = this.randomInRange(0.8, 1.5)
        params.atmosphericLight = [180, 185, 195]
        params.rainIntensity = this.randomInRange(0.3, 0.7)
        break

      case 'haze':
        // 霾：偏黄的大气散射
        params.beta = this.randomInRange(1.0, 2.0)
        params.atmosphericLight = [220, 210, 190]
        params.depthScale = this.randomInRange(0.6, 1.0)
        break
    }

    return params
  }

  applyRealisticWeather(params) {
    if (!params) return null

    const { type, beta, atmosphericLight, depthScale, rainIntensity } = params
    const { width, height } = this.canvas

    // 应用大气散射效果
    this.applyAtmosphericScattering(beta, atmosphericLight, depthScale)

    // 如果是雨天，添加雨滴效果
    if (type === 'rain' && rainIntensity > 0) {
      this.applyRainDrops(rainIntensity)
    }

    return params
  }

  /**
   * 大气散射效果 - 基于 Koschmieder 定律
   * I(d) = I0 * t(d) + A * (1 - t(d))
   * 其中 t(d) = e^(-βd) 是透射率
   */
  applyAtmosphericScattering(beta, atmosphericLight, depthScale) {
    const { width, height } = this.canvas
    const imageData = this.ctx.getImageData(0, 0, width, height)
    const { data } = imageData

    const [aR, aG, aB] = atmosphericLight

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4

        // 模拟深度：使用位置和噪声生成伪深度图
        // 底部更近（深度小），顶部更远（深度大）
        const baseDepth = (y / height) * depthScale
        const noise = (Math.sin(x * 0.1) * Math.cos(y * 0.1) + 1) * 0.1
        const depth = Math.max(0, Math.min(1, baseDepth + noise))

        // 计算透射率
        const transmission = Math.exp(-beta * depth)

        // 应用大气散射公式
        const r = data[idx]
        const g = data[idx + 1]
        const b = data[idx + 2]

        data[idx] = Math.round(r * transmission + aR * (1 - transmission))
        data[idx + 1] = Math.round(g * transmission + aG * (1 - transmission))
        data[idx + 2] = Math.round(b * transmission + aB * (1 - transmission))
      }
    }

    this.ctx.putImageData(imageData, 0, 0)
  }

  /**
   * 改进的雨滴效果 - 带运动模糊和透视
   */
  applyRainDrops(intensity) {
    const { width, height } = this.canvas

    // 先添加轻微高斯模糊模拟雨雾
    this.applyGaussianBlur(1)

    // 雨滴参数
    const dropCount = Math.floor(width * height * intensity * 0.008)
    const angle = this.randomInRange(-0.1, 0.1) // 轻微倾斜

    this.ctx.save()

    // 绘制多层雨滴（模拟深度）
    for (let layer = 0; layer < 3; layer++) {
      const layerIntensity = intensity * (1 - layer * 0.3)
      const layerDropCount = Math.floor(dropCount * (1 - layer * 0.3))
      const layerLength = (20 + layer * 15) * (1 - layer * 0.2)
      const layerWidth = 1.5 - layer * 0.3

      this.ctx.strokeStyle = `rgba(180, 190, 210, ${layerIntensity * 0.4})`
      this.ctx.lineWidth = layerWidth
      this.ctx.lineCap = 'round'

      for (let i = 0; i < layerDropCount; i++) {
        const x = Math.random() * width
        const y = Math.random() * height
        const length = layerLength + Math.random() * 10
        const dropAngle = angle + (Math.random() - 0.5) * 0.1

        this.ctx.beginPath()
        this.ctx.moveTo(x, y)
        this.ctx.lineTo(
          x + length * Math.sin(dropAngle),
          y + length * Math.cos(dropAngle)
        )
        this.ctx.stroke()
      }
    }

    // 添加溅射效果（底部更多）
    this.ctx.fillStyle = `rgba(200, 210, 230, ${intensity * 0.3})`
    const splashCount = Math.floor(dropCount * 0.2)
    for (let i = 0; i < splashCount; i++) {
      const x = Math.random() * width
      const y = height * 0.7 + Math.random() * height * 0.3 // 主要在底部
      const size = 1 + Math.random() * 2

      this.ctx.beginPath()
      this.ctx.arc(x, y, size, 0, Math.PI * 2)
      this.ctx.fill()
    }

    this.ctx.restore()
  }

  // ========== 5. 防判重遮挡 ==========

  randomOcclusionParams() {
    const types = ['cutout', 'smudge', 'water_drop', 'sticker']
    return {
      type: types[Math.floor(Math.random() * types.length)],
      count: Math.floor(this.randomInRange(1, 3)),
      minSize: this.randomInRange(0.04, 0.08),
      maxSize: this.randomInRange(0.08, 0.12),
      uniqueMarker: Math.random().toString(36).substring(2, 6) // 防判重标记
    }
  }

  applyRealisticOcclusion(params, seed) {
    if (!params) return null

    const { width, height } = this.canvas
    const { type, count, minSize, maxSize } = params

    // 使用种子确保遮挡位置可复现
    const random = this.seededRandom(seed)

    for (let i = 0; i < count; i++) {
      const sizeW = width * (minSize + random() * (maxSize - minSize))
      const sizeH = height * (minSize + random() * (maxSize - minSize))
      const x = random() * (width - sizeW)
      const y = random() * (height - sizeH)

      switch (type) {
        case 'cutout':
          this.applyCutoutOcclusion(x, y, sizeW, sizeH)
          break
        case 'smudge':
          this.applySmudgeOcclusion(x, y, sizeW, sizeH)
          break
        case 'water_drop':
          this.applyWaterDropOcclusion(x, y, sizeW, sizeH)
          break
        case 'sticker':
          this.applyStickerOcclusion(x, y, sizeW, sizeH, params.uniqueMarker)
          break
      }
    }

    return params
  }

  applyCutoutOcclusion(x, y, w, h) {
    // 带边缘渐变的黑色块
    const gradient = this.ctx.createRadialGradient(
      x + w / 2, y + h / 2, 0,
      x + w / 2, y + h / 2, Math.max(w, h) / 2
    )
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.85)')
    gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.7)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)')

    this.ctx.fillStyle = gradient
    this.ctx.fillRect(x, y, w, h)
  }

  applySmudgeOcclusion(x, y, w, h) {
    // 涂抹/模糊遮挡
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = w
    tempCanvas.height = h
    const tempCtx = tempCanvas.getContext('2d')

    // 裁剪出遮挡区域
    tempCtx.drawImage(this.canvas, x, y, w, h, 0, 0, w, h)

    // 模糊
    tempCtx.filter = 'blur(8px)'
    tempCtx.drawImage(tempCanvas, 0, 0)

    // 用模糊的区域覆盖
    this.ctx.filter = 'blur(4px)'
    this.ctx.globalAlpha = 0.6
    this.ctx.drawImage(tempCanvas, x, y)
    this.ctx.filter = 'none'
    this.ctx.globalAlpha = 1
  }

  applyWaterDropOcclusion(x, y, w, h) {
    // 水滴遮挡 - 半透明，带高光
    const cx = x + w / 2
    const cy = y + h / 2
    const rx = w / 2
    const ry = h / 2

    // 水滴形状
    const gradient = this.ctx.createRadialGradient(
      cx - rx * 0.3, cy - ry * 0.3, 0,
      cx, cy, Math.max(rx, ry)
    )
    gradient.addColorStop(0, 'rgba(220, 235, 250, 0.7)')
    gradient.addColorStop(0.5, 'rgba(180, 210, 240, 0.5)')
    gradient.addColorStop(1, 'rgba(150, 180, 220, 0.3)')

    this.ctx.fillStyle = gradient
    this.ctx.beginPath()
    this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    this.ctx.fill()

    // 高光
    const highlightGradient = this.ctx.createRadialGradient(
      cx - rx * 0.3, cy - ry * 0.3, 0,
      cx - rx * 0.3, cy - ry * 0.3, rx * 0.4
    )
    highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)')
    highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

    this.ctx.fillStyle = highlightGradient
    this.ctx.beginPath()
    this.ctx.ellipse(cx - rx * 0.2, cy - ry * 0.2, rx * 0.3, ry * 0.3, 0, 0, Math.PI * 2)
    this.ctx.fill()
  }

  applyStickerOcclusion(x, y, w, h, marker) {
    // 贴纸式遮挡 - 带边框，更明显的异物感
    // 背景
    this.ctx.fillStyle = `hsl(${Math.random() * 360}, 60%, 50%)`
    this.ctx.fillRect(x, y, w, h)

    // 边框
    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
    this.ctx.lineWidth = 2
    this.ctx.strokeRect(x, y, w, h)

    // 标记文字（防判重）
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    this.ctx.font = `${Math.min(w, h) * 0.4}px sans-serif`
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.fillText(marker, x + w / 2, y + h / 2)
  }

  // ========== 6. 辅助方法 ==========

  gaussianRandom() {
    let u = 0, v = 0
    while (u === 0) u = Math.random()
    while (v === 0) v = Math.random()
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
  }

  seededRandom(seed) {
    let s = seed
    return function () {
      s = Math.sin(s) * 10000
      return s - Math.floor(s)
    }
  }

  randomInRange(min, max) {
    return min + Math.random() * (max - min)
  }

  shuffle(array) {
    const arr = [...array]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }

  exportToDataURL(format = 'image/jpeg', quality = 0.9) {
    return this.canvas.toDataURL(format, quality)
  }

  async batchAugment(imageElement, configs, onProgress) {
    const results = []
    const total = configs.length

    for (let i = 0; i < total; i++) {
      const result = this.augment(imageElement, configs[i])
      results.push({
        canvas: result.canvas,
        dataUrl: this.exportToDataURL(),
        metadata: result.metadata,
        config: configs[i]
      })

      if (onProgress) {
        onProgress(i + 1, total, configs[i])
      }

      await new Promise(resolve => setTimeout(resolve, 0))
    }

    return results
  }
}
