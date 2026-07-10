/**
 * WebNN Runner - Web Neural Network Runtime Wrapper
 * 支持 ONNX Runtime Web 图像预处理
 */

export class WebNNRunner {
  constructor() {
    this.session = null
    this.isInitialized = false
  }

  /**
   * 运行推理
   */
  async run(inputData) {
    if (!this.session) {
      throw new Error('模型未初始化')
    }

    const startTime = performance.now()
    const results = await this.session.run(inputData)
    const endTime = performance.now()

    return {
      results,
      inferenceTime: endTime - startTime
    }
  }

  /**
   * 图像预处理 - 归一化 + 调整尺寸
   */
  preprocessImage(imageElement, targetSize = [224, 224]) {
    const [width, height] = targetSize
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    // 绘制并缩放图像
    ctx.drawImage(imageElement, 0, 0, width, height)

    // 获取像素数据
    const imageData = ctx.getImageData(0, 0, width, height)
    const { data } = imageData

    // 归一化到 [0, 1] 并转换为 CHW 格式 (Channel, Height, Width)
    const floatData = new Float32Array(3 * width * height)

    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4] / 255
      const g = data[i * 4 + 1] / 255
      const b = data[i * 4 + 2] / 255

      floatData[i] = r                    // R channel
      floatData[width * height + i] = g  // G channel
      floatData[2 * width * height + i] = b // B channel
    }

    return {
      tensor: floatData,
      dims: [1, 3, height, width]
    }
  }

  /**
   * ImageNet 预处理 (带均值标准差)
   */
  preprocessImageNet(imageElement, targetSize = [224, 224]) {
    const [width, height] = targetSize
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(imageElement, 0, 0, width, height)

    const imageData = ctx.getImageData(0, 0, width, height)
    const { data } = imageData

    // ImageNet 均值和标准差
    const mean = [0.485, 0.456, 0.406]
    const std = [0.229, 0.224, 0.225]

    const floatData = new Float32Array(3 * width * height)

    for (let i = 0; i < width * height; i++) {
      const r = (data[i * 4] / 255 - mean[0]) / std[0]
      const g = (data[i * 4 + 1] / 255 - mean[1]) / std[1]
      const b = (data[i * 4 + 2] / 255 - mean[2]) / std[2]

      floatData[i] = r
      floatData[width * height + i] = g
      floatData[2 * width * height + i] = b
    }

    return {
      tensor: floatData,
      dims: [1, 3, height, width]
    }
  }

  /**
   * 创建 ONNX Tensor
   */
  createTensor(data, dims) {
    return {
      name: 'input',
      data,
      dims,
      type: 'float32'
    }
  }
}
