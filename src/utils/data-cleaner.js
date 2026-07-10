/**
 * 数据清洗工具类
 * 功能：样本去重、坏图剔除、大小/格式归一化
 * 
 * 去重策略：
 * 1. pHash - 像素级相似度（检测完全相同的图）
 * 2. 内容特征 - 基于颜色/边缘/纹理/空间金字塔的128维特征（检测内容相似的图）
 */

export class DataCleaner {
  constructor() {
    this.targetWidth = 1920  // 1080P 宽度
    this.targetHeight = 1080 // 1080P 高度
    this.quality = 0.9       // JPEG 质量
    this.similarityThreshold = 0.95 // pHash 相似度阈值
    this.contentThreshold = 0.85    // 内容特征相似度阈值
    this.exactDuplicateThreshold = 0.995 // 仅用于判断几乎完全相同的图片
    this.sameSceneThreshold = 0.93        // 同机位/同场景结构相似度阈值
    this.contentStateSimilarityThreshold = 0.94 // 内容状态一致才允许进入去重
    this.illuminationDuplicateThreshold = 0.965 // 光照条件相似则视为重复
    this.minimumDistinctIlluminationDistance = 0.035 // 保留光照变体的最小差异
    this.maxIlluminationVariants = 2      // 同一场景最多保留的光照差异样本数
    
    // 光照敏感模式配置
    this.illuminationMode = {
      // 颜色直方图 bins 数（更多bins捕获细微颜色差异）
      colorBins: 64,
      // 边缘阈值（调整以适应不同光照）
      edgeThreshold: 25,
      // 高光检测阈值
      highlightThreshold: 230,
      // 阴影检测阈值
      shadowThreshold: 30
    }
  }

  /**
   * 计算感知哈希 (pHash) - 用于图片相似度比较
   * @param {ImageBitmap|HTMLImageElement} image
   * @returns {Promise<string>} 64位哈希字符串
   */
  async computePHash(image) {
    // 缩放到 32x32
    const canvas = new OffscreenCanvas(32, 32)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0, 32, 32)

    const imageData = ctx.getImageData(0, 0, 32, 32)
    const gray = new Float32Array(32 * 32)

    // 转灰度
    for (let i = 0; i < imageData.data.length; i += 4) {
      const r = imageData.data[i]
      const g = imageData.data[i + 1]
      const b = imageData.data[i + 2]
      gray[i / 4] = 0.299 * r + 0.587 * g + 0.114 * b
    }

    // 简化的 DCT (离散余弦变换) - 使用平均值代替
    const blocks = new Float32Array(8 * 8)
    for (let by = 0; by < 8; by++) {
      for (let bx = 0; bx < 8; bx++) {
        let sum = 0
        for (let y = 0; y < 4; y++) {
          for (let x = 0; x < 4; x++) {
            const py = by * 4 + y
            const px = bx * 4 + x
            sum += gray[py * 32 + px]
          }
        }
        blocks[by * 8 + bx] = sum / 16
      }
    }

    // 计算平均值并生成哈希
    const avg = blocks.reduce((a, b) => a + b, 0) / 64
    let hash = ''
    for (let i = 0; i < 64; i++) {
      hash += blocks[i] > avg ? '1' : '0'
    }

    return hash
  }

  /**
   * 计算汉明距离
   * @param {string} hash1
   * @param {string} hash2
   * @returns {number} 0-64 的距离值
   */
  hammingDistance(hash1, hash2) {
    let distance = 0
    for (let i = 0; i < 64; i++) {
      if (hash1[i] !== hash2[i]) distance++
    }
    return distance
  }

  /**
   * 计算相似度
   * @param {string} hash1
   * @param {string} hash2
   * @returns {number} 0-1 的相似度
   */
  similarity(hash1, hash2) {
    const distance = this.hammingDistance(hash1, hash2)
    return 1 - distance / 64
  }

  /**
   * 检查图片是否有效
   * @param {File} file
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  async validateImage(file) {
    // 检查文件头
    const header = await this.readFileHeader(file, 8)

    // JPEG 文件头: FF D8 FF
    // PNG 文件头: 89 50 4E 47
    const isJPEG = header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF
    const isPNG = header[0] === 0x89 && header[1] === 0x50 &&
                  header[2] === 0x4E && header[3] === 0x47

    if (!isJPEG && !isPNG) {
      return { valid: false, error: '不支持的图片格式（仅支持 JPEG/PNG）' }
    }

    // 尝试解码图片
    try {
      const bitmap = await createImageBitmap(file)

      // 检查尺寸
      if (bitmap.width < 10 || bitmap.height < 10) {
        bitmap.close()
        return { valid: false, error: '图片尺寸过小' }
      }

      // 检查文件大小是否合理（避免损坏的图片）
      if (file.size < 100) {
        bitmap.close()
        return { valid: false, error: '文件大小异常（可能已损坏）' }
      }

      bitmap.close()
      return { valid: true }
    } catch (e) {
      return { valid: false, error: '图片解码失败: ' + e.message }
    }
  }

  /**
   * 读取文件头
   * @param {File} file
   * @param {number} length
   * @returns {Promise<Uint8Array>}
   */
  readFileHeader(file, length) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(new Uint8Array(e.target.result))
      reader.onerror = reject
      reader.readAsArrayBuffer(file.slice(0, length))
    })
  }

  /**
  * 归一化图片尺寸和格式
  * @param {ImageBitmap} bitmap
  * @returns {Promise<{blob: Blob, dimensions: {width: number, height: number}}>}
   */
  async normalizeImage(bitmap) {
    let { width, height } = bitmap

    // 按比例缩放以适应目标尺寸（保持宽高比）
    const scale = Math.min(
      this.targetWidth / width,
      this.targetHeight / height
    )

    // 计算缩放后的尺寸
    let newWidth = Math.floor(width * scale)
    let newHeight = Math.floor(height * scale)

    // 确保不超过目标尺寸
    newWidth = Math.min(newWidth, this.targetWidth)
    newHeight = Math.min(newHeight, this.targetHeight)

    // 创建 canvas 进行绘制
    const canvas = document.createElement('canvas')
    canvas.width = newWidth
    canvas.height = newHeight
    const ctx = canvas.getContext('2d')

    // 使用高质量缩放
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, newWidth, newHeight)

    // 导出为 JPEG
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve({
          blob,
          dimensions: {
            width: newWidth,
            height: newHeight
          }
        })
      }, 'image/jpeg', this.quality)
    })
  }

  /**
   * 构建可参与去重和归一化的样本
   * @param {File} file
   * @returns {Promise<{success: boolean, sample?: object, error?: string, fileName?: string, stage?: string}>}
   */
  async buildProcessSample(file) {
    const startTime = performance.now()

    const validation = await this.validateImage(file)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        fileName: file.name,
        stage: 'validation'
      }
    }

    let bitmap
    try {
      bitmap = await createImageBitmap(file)
    } catch (e) {
      return {
        success: false,
        error: '图片解码失败',
        fileName: file.name,
        stage: 'decode'
      }
    }

    try {
      const dimensions = { width: bitmap.width, height: bitmap.height }
      const hash = await this.computePHash(bitmap)
      const features = await this.extractContentFeatures(bitmap)
      const illuminationFeatures = await this.extractIlluminationSensitiveFeatures(bitmap)
      const isTargetSize = bitmap.width === this.targetWidth && bitmap.height === this.targetHeight
      const isJpeg = file.type.includes('jpeg') || file.type.includes('jpg')

      const normalized = isTargetSize && isJpeg
        ? { blob: file, dimensions }
        : await this.normalizeImage(bitmap)

      const result = {
        success: true,
        fileName: file.name,
        originalSize: file.size,
        normalizedSize: normalized.blob.size,
        originalType: file.type,
        normalizedType: isTargetSize && isJpeg ? file.type : 'image/jpeg',
        dimensions,
        normalizedDimensions: normalized.dimensions,
        hash,
        blob: normalized.blob,
        processTime: performance.now() - startTime
      }

      return {
        success: true,
        sample: {
          file,
          fileName: file.name,
          hash,
          features,
          illuminationFeatures,
          result
        }
      }
    } finally {
      bitmap.close()
    }
  }

  /**
   * 计算同场景结构相似度，弱化颜色影响，重点看边缘、空间与纹理
   * @param {object} sample1
   * @param {object} sample2
   * @returns {number}
   */
  computeSceneSimilarity(sample1, sample2) {
    return this.computeSceneComparison(sample1, sample2).sceneSim
  }

  /**
   * 计算场景与内容状态对比详情
   * @param {object} sample1
   * @param {object} sample2
   * @returns {{sceneSim: number, structureSim: number, contentSim: number, pHashSim: number, featureSims: object}}
   */
  computeSceneComparison(sample1, sample2) {
    const featureSims = this.analyzeFeatureSimilarity(sample1.features, sample2.features)
    const structureSim =
      featureSims.edge * 0.45 +
      featureSims.spatial * 0.35 +
      featureSims.texture * 0.20
    const pHashSim = this.similarity(sample1.hash, sample2.hash)
    const contentSim = this.computeContentSimilarity(sample1.features, sample2.features)

    return {
      sceneSim: structureSim * 0.8 + pHashSim * 0.2,
      structureSim,
      contentSim,
      pHashSim,
      featureSims
    }
  }

  /**
   * 判断两张图是否只是光照不同，而不是设备状态/局部内容变化
   * @param {object} comparison
   * @returns {boolean}
   */
  hasSameContentState(comparison) {
    return comparison.contentSim >= this.contentStateSimilarityThreshold || (
      comparison.featureSims.edge >= 0.965 &&
      comparison.featureSims.spatial >= 0.94 &&
      comparison.featureSims.texture >= 0.94
    )
  }

  /**
   * 计算光照差异，数值越大表示越值得同时保留
   * @param {object} sample1
   * @param {object} sample2
   * @returns {{distance: number, similarity: number, details: object}}
   */
  computeIlluminationDistance(sample1, sample2) {
    const result = this.computeIlluminationSensitiveSimilarity(
      sample1.illuminationFeatures,
      sample2.illuminationFeatures
    )
    const detailDistance =
      (1 - result.details.skyColor) * 0.35 +
      (1 - result.details.highlight) * 0.30 +
      (1 - result.details.brightness) * 0.20 +
      (1 - result.details.textureContrast) * 0.15

    return {
      distance: Math.max(1 - result.score, detailDistance),
      similarity: result.score,
      details: result.details
    }
  }

  /**
   * 从候选样本中选出光照差异最大的两张
   * @param {Array<object>} samples
   * @returns {{pair: Array<object>, distance: number}}
   */
  selectMostDistinctIlluminationPair(samples) {
    if (samples.length <= 2) {
      const distance = samples.length === 2
        ? this.computeIlluminationDistance(samples[0], samples[1]).distance
        : 0
      return { pair: samples, distance }
    }

    let bestPair = [samples[0], samples[1]]
    let bestDistance = -1

    for (let i = 0; i < samples.length; i++) {
      for (let j = i + 1; j < samples.length; j++) {
        const distance = this.computeIlluminationDistance(samples[i], samples[j]).distance
        if (distance > bestDistance) {
          bestDistance = distance
          bestPair = [samples[i], samples[j]]
        }
      }
    }

    return { pair: bestPair, distance: bestDistance }
  }

  /**
   * 基于同场景聚类和光照差异判断样本去留
   * @param {object} sample
   * @param {Array<object>} sceneGroups
   * @returns {{action: string, group?: object, duplicateOf?: object, replacedSample?: object, details?: object}}
   */
  resolveLightingAwareDeduplication(sample, sceneGroups) {
    let matchedGroup = null
    let matchedComparison = null

    for (const group of sceneGroups) {
      let groupComparison = null
      for (const keepSample of group.samples) {
        const comparison = this.computeSceneComparison(sample, keepSample)
        if (!groupComparison || comparison.sceneSim > groupComparison.sceneSim) {
          groupComparison = comparison
        }
      }

      if (!matchedComparison || groupComparison.sceneSim > matchedComparison.sceneSim) {
        matchedComparison = groupComparison
        matchedGroup = group
      }
    }

    if (!matchedGroup || matchedComparison.sceneSim < this.sameSceneThreshold) {
      const group = { samples: [sample] }
      sceneGroups.push(group)
      return {
        action: 'keep',
        group,
        details: { sceneSim: matchedComparison?.sceneSim || 0, reason: '新场景' }
      }
    }

    const sameContentSamples = matchedGroup.samples.filter((keepSample) => {
      const comparison = this.computeSceneComparison(sample, keepSample)
      return this.hasSameContentState(comparison)
    })

    if (sameContentSamples.length === 0) {
      const group = { samples: [sample] }
      sceneGroups.push(group)
      return {
        action: 'keep',
        group,
        details: {
          sceneSim: matchedComparison.sceneSim,
          contentSim: matchedComparison.contentSim,
          featureSims: matchedComparison.featureSims,
          reason: '同机位但内容状态变化'
        }
      }
    }

    let nearestSample = sameContentSamples[0]
    let nearestIllumination = this.computeIlluminationDistance(sample, nearestSample)
    let maxIlluminationDistance = nearestIllumination.distance

    for (const keepSample of sameContentSamples) {
      const pHashSim = this.similarity(sample.hash, keepSample.hash)
      const illumination = this.computeIlluminationDistance(sample, keepSample)

      if (illumination.distance < nearestIllumination.distance) {
        nearestSample = keepSample
        nearestIllumination = illumination
      }
      maxIlluminationDistance = Math.max(maxIlluminationDistance, illumination.distance)

      if (
        pHashSim >= this.exactDuplicateThreshold &&
        illumination.similarity >= this.illuminationDuplicateThreshold
      ) {
        return {
          action: 'duplicate',
          group: matchedGroup,
          duplicateOf: keepSample,
          details: {
            pHashSim,
            sceneSim: matchedComparison.sceneSim,
            illumination,
            reason: '像素和光照几乎完全相同'
          }
        }
      }
    }

    if (
      nearestIllumination.similarity >= this.illuminationDuplicateThreshold &&
      maxIlluminationDistance < this.minimumDistinctIlluminationDistance
    ) {
      return {
        action: 'duplicate',
        group: matchedGroup,
        duplicateOf: nearestSample,
        details: {
          sceneSim: matchedComparison.sceneSim,
          illumination: nearestIllumination,
          reason: '同场景且光照差异不足'
        }
      }
    }

    if (matchedGroup.samples.length < this.maxIlluminationVariants) {
      matchedGroup.samples.push(sample)
      return {
        action: 'keep',
        group: matchedGroup,
        details: {
          sceneSim: matchedComparison.sceneSim,
          contentSim: matchedComparison.contentSim,
          illuminationDistance: maxIlluminationDistance,
          reason: '同场景但光照差异明显'
        }
      }
    }

    const candidates = [...matchedGroup.samples, sample]
    const currentPair = this.selectMostDistinctIlluminationPair(matchedGroup.samples)
    const nextPair = this.selectMostDistinctIlluminationPair(candidates)
    const shouldReplace =
      nextPair.pair.includes(sample) &&
      nextPair.distance > currentPair.distance + this.minimumDistinctIlluminationDistance / 2

    if (!shouldReplace) {
      return {
        action: 'duplicate',
        group: matchedGroup,
        duplicateOf: nearestSample,
        details: {
          sceneSim: matchedComparison.sceneSim,
          contentSim: matchedComparison.contentSim,
          illuminationDistance: maxIlluminationDistance,
          reason: '已有更有代表性的光照差异样本'
        }
      }
    }

    const replacedSample = matchedGroup.samples.find((keepSample) => !nextPair.pair.includes(keepSample))
    matchedGroup.samples = nextPair.pair

    return {
      action: 'replace',
      group: matchedGroup,
      replacedSample,
      details: {
        sceneSim: matchedComparison.sceneSim,
        contentSim: matchedComparison.contentSim,
        illuminationDistance: nextPair.distance,
        reason: '替换为光照差异更大的样本'
      }
    }
  }

  /**
   * 生成去重失败结果
   * @param {object} sample
   * @param {object} duplicateOf
   * @param {object} details
   * @returns {object}
   */
  createDuplicateFailure(sample, duplicateOf, details = {}) {
    const illuminationDistance = details.illumination?.distance ?? details.illuminationDistance
    const suffix = Number.isFinite(illuminationDistance)
      ? `，光照差异 ${(illuminationDistance * 100).toFixed(1)}%`
      : ''

    return {
      success: false,
      error: `与 ${duplicateOf?.fileName || '已保留样本'} 重复（${details.reason || '相似度过高'}${suffix}）`,
      fileName: sample.fileName,
      stage: 'deduplication',
      hash: sample.hash,
      file: sample.file,
      duplicateOf: duplicateOf?.fileName || null,
      duplicateFile: duplicateOf?.file || null,
      dedupeDetails: details
    }
  }

  /**
   * pHash 只负责召回疑似重复，最终删除必须二次确认内容和光照状态
   * @param {object} sample
   * @param {Array<object>} keptSamples
   * @returns {{action: string, duplicateOf?: object, replacedSample?: object, details?: object}}
   */
  resolveHashCandidateDeduplication(sample, keptSamples) {
    const sameContentCandidates = []
    let nearestCandidate = null
    let nearestPHashSim = 0

    for (const keepSample of keptSamples) {
      const pHashSim = this.similarity(sample.hash, keepSample.hash)
      if (pHashSim < this.similarityThreshold) continue

      const comparison = this.computeSceneComparison(sample, keepSample)
      const illumination = this.computeIlluminationDistance(sample, keepSample)

      if (pHashSim > nearestPHashSim) {
        nearestPHashSim = pHashSim
        nearestCandidate = { keepSample, comparison, illumination, pHashSim }
      }

      if (!this.hasSameContentState(comparison)) {
        continue
      }

      sameContentCandidates.push({ keepSample, comparison, illumination, pHashSim })

      if (
        pHashSim >= this.exactDuplicateThreshold &&
        illumination.similarity >= this.illuminationDuplicateThreshold
      ) {
        return {
          action: 'duplicate',
          duplicateOf: keepSample,
          details: {
            pHashSim,
            sceneSim: comparison.sceneSim,
            contentSim: comparison.contentSim,
            featureSims: comparison.featureSims,
            illumination,
            reason: '像素、内容和光照都几乎完全相同'
          }
        }
      }

      if (
        illumination.similarity >= this.illuminationDuplicateThreshold &&
        illumination.distance < this.minimumDistinctIlluminationDistance
      ) {
        return {
          action: 'duplicate',
          duplicateOf: keepSample,
          details: {
            pHashSim,
            sceneSim: comparison.sceneSim,
            contentSim: comparison.contentSim,
            featureSims: comparison.featureSims,
            illumination,
            reason: 'pHash 相似，且内容与光照差异不足'
          }
        }
      }
    }

    if (sameContentCandidates.length === 0) {
      return {
        action: 'keep',
        details: nearestCandidate
          ? {
              pHashSim: nearestCandidate.pHashSim,
              sceneSim: nearestCandidate.comparison.sceneSim,
              contentSim: nearestCandidate.comparison.contentSim,
              featureSims: nearestCandidate.comparison.featureSims,
              illumination: nearestCandidate.illumination,
              reason: 'pHash 相似但内容状态不同，保留'
            }
          : { reason: '未命中 pHash 重复候选，保留' }
      }
    }

    if (sameContentCandidates.length < this.maxIlluminationVariants) {
      const maxIlluminationDistance = Math.max(...sameContentCandidates.map((item) => item.illumination.distance))
      return {
        action: 'keep',
        details: {
          pHashSim: nearestPHashSim,
          sceneSim: nearestCandidate.comparison.sceneSim,
          contentSim: nearestCandidate.comparison.contentSim,
          featureSims: nearestCandidate.comparison.featureSims,
          illuminationDistance: maxIlluminationDistance,
          reason: 'pHash 相似但光照差异明显，作为光照变体保留'
        }
      }
    }

    const candidateSamples = sameContentCandidates.map((item) => item.keepSample)
    const currentPair = this.selectMostDistinctIlluminationPair(candidateSamples)
    const nextPair = this.selectMostDistinctIlluminationPair([...candidateSamples, sample])
    const shouldReplace =
      nextPair.pair.includes(sample) &&
      nextPair.distance > currentPair.distance + this.minimumDistinctIlluminationDistance / 2

    if (!shouldReplace) {
      return {
        action: 'duplicate',
        duplicateOf: nearestCandidate.keepSample,
        details: {
          pHashSim: nearestPHashSim,
          sceneSim: nearestCandidate.comparison.sceneSim,
          contentSim: nearestCandidate.comparison.contentSim,
          featureSims: nearestCandidate.comparison.featureSims,
          illuminationDistance: Math.max(...sameContentCandidates.map((item) => item.illumination.distance)),
          reason: '已有更有代表性的光照差异样本'
        }
      }
    }

    return {
      action: 'replace',
      replacedSample: candidateSamples.find((keepSample) => !nextPair.pair.includes(keepSample)),
      details: {
        pHashSim: nearestPHashSim,
        sceneSim: nearestCandidate.comparison.sceneSim,
        contentSim: nearestCandidate.comparison.contentSim,
        featureSims: nearestCandidate.comparison.featureSims,
        illuminationDistance: nextPair.distance,
        reason: '替换为光照差异更大的 pHash 候选样本'
      }
    }
  }

  /**
   * 处理单个文件
   * @param {File} file
   * @param {Map} hashMap - 已处理的图片哈希映射
   * @returns {Promise<{success: boolean, result?: object, error?: string}>}
   */
  async processFile(file, hashMap = new Map()) {
    const prepared = await this.buildProcessSample(file)
    if (!prepared.success) return prepared

    const { sample } = prepared
    for (const [existingHash, info] of hashMap) {
      const pHashSim = this.similarity(sample.hash, existingHash)
      if (pHashSim >= this.exactDuplicateThreshold) {
        return this.createDuplicateFailure(sample, info, {
          pHashSim,
          reason: '像素几乎完全相同'
        })
      }
    }

    hashMap.set(sample.hash, { fileName: file.name, hash: sample.hash })

    return sample.result
  }

  /**
   * 批量处理文件
   * @param {FileList} files
   * @param {Function} onProgress - 进度回调 (current, total, fileResult)
   * @returns {Promise<{success: Array, failed: Array, stats: object}>}
   */
  async processBatch(files, onProgress = null) {
    const results = {
      success: [],
      duplicates: [],
      badImages: [],
      stats: {
        total: files.length,
        processed: 0,
        passed: 0,
        duplicates: 0,
        badImages: 0,
        originalTotalSize: 0,
        normalizedTotalSize: 0
      }
    }

    const keptSamples = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      results.stats.originalTotalSize += file.size

      const prepared = await this.buildProcessSample(file)
      results.stats.processed++

      let result
      if (prepared.success) {
        const { sample } = prepared
        const decision = this.resolveHashCandidateDeduplication(sample, keptSamples)

        if (decision.action === 'duplicate') {
          result = this.createDuplicateFailure(sample, decision.duplicateOf, decision.details)
        } else {
          result = sample.result
          result.dedupeDetails = decision.details

          if (decision.action === 'replace' && decision.replacedSample) {
            const replacedResult = decision.replacedSample.result
            const replacedIndex = results.success.indexOf(replacedResult)
            if (replacedIndex !== -1) {
              results.success.splice(replacedIndex, 1)
            }
            const replacedSampleIndex = keptSamples.indexOf(decision.replacedSample)
            if (replacedSampleIndex !== -1) {
              keptSamples.splice(replacedSampleIndex, 1)
            }
            results.stats.passed--
            results.stats.normalizedTotalSize -= replacedResult.normalizedSize
            results.stats.duplicates++
            results.duplicates.push(this.createDuplicateFailure(
              decision.replacedSample,
              sample,
              decision.details
            ))
          }

          keptSamples.push(sample)
        }
      } else {
        result = prepared
      }

      if (result.success) {
        results.success.push(result)
        results.stats.passed++
        results.stats.normalizedTotalSize += result.normalizedSize
      } else if (result.stage === 'deduplication') {
        results.duplicates.push(result)
        results.stats.duplicates++
      } else {
        results.badImages.push(result)
        results.stats.badImages++
      }

      if (onProgress) {
        onProgress(i + 1, files.length, result)
      }
    }

    return results
  }

  /**
   * 生成处理报告
   * @param {object} results
   * @returns {string} Markdown 格式的报告
   */
  generateReport(results) {
    const { stats, success, duplicates, badImages } = results
    const sizeReduction = ((1 - stats.normalizedTotalSize / stats.originalTotalSize) * 100).toFixed(1)

    let report = `# 数据清洗报告\n\n`
    report += `## 统计摘要\n\n`
    report += `- **总文件数**: ${stats.total}\n`
    report += `- **通过**: ${stats.passed} (${(stats.passed / stats.total * 100).toFixed(1)}%)\n`
    report += `- **重复**: ${stats.duplicates} (${(stats.duplicates / stats.total * 100).toFixed(1)}%)\n`
    report += `- **损坏**: ${stats.badImages} (${(stats.badImages / stats.total * 100).toFixed(1)}%)\n`
    report += `- **原始总大小**: ${(stats.originalTotalSize / 1024 / 1024).toFixed(2)} MB\n`
    report += `- **归一化后总大小**: ${(stats.normalizedTotalSize / 1024 / 1024).toFixed(2)} MB\n`
    report += `- **空间节省**: ${sizeReduction}%\n\n`

    if (duplicates.length > 0) {
      report += `## 重复文件详情\n\n`
      report += `| 文件名 | 阶段 | 原因 |\n`
      report += `|--------|------|------|\n`
      for (const item of duplicates) {
        report += `| ${item.fileName} | ${item.stage} | ${item.error} |\n`
      }
      report += `\n`
    }

    if (badImages.length > 0) {
      report += `## 损坏文件详情\n\n`
      report += `| 文件名 | 阶段 | 原因 |\n`
      report += `|--------|------|------|\n`
      for (const item of badImages) {
        report += `| ${item.fileName} | ${item.stage} | ${item.error} |\n`
      }
      report += `\n`
    }

    if (success.length > 0) {
      report += `## 成功文件示例\n\n`
      report += `| 文件名 | 原始大小 | 归一化后 | 尺寸 | 处理时间 |\n`
      report += `|--------|----------|----------|------|----------|\n`
      for (const item of success.slice(0, 10)) {
        const origSize = (item.originalSize / 1024).toFixed(1) + ' KB'
        const normSize = (item.normalizedSize / 1024).toFixed(1) + ' KB'
        const dims = `${item.dimensions.width}x${item.dimensions.height}`
        const time = item.processTime.toFixed(1) + ' ms'
        report += `| ${item.fileName} | ${origSize} | ${normSize} | ${dims} | ${time} |\n`
      }
      if (success.length > 10) {
        report += `| ... 还有 ${success.length - 10} 个文件 | | | | |\n`
      }
    }

    return report
  }

  // ==================== 基于图片内容特征的务实去重方案 ====================
  
  /**
   * 提取光照敏感特征向量（区分不同光照/天气条件）
   * 专门用于检测：白天/夜晚、有雪/无雪、晴天/阴天等差异
   * @param {ImageBitmap|HTMLImageElement} image
   * @returns {Promise<Float32Array>} 192维特征向量
   */
  async extractIlluminationSensitiveFeatures(image) {
    const size = 256  // 提高分辨率以捕获更多细节
    const canvas = new OffscreenCanvas(size, size)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0, size, size)
    
    const imageData = ctx.getImageData(0, 0, size, size)
    const { data, width, height } = imageData
    
    // 1. 亮度分布特征 (32维) - 检测天空/高光/阴影
    const brightnessDist = this._computeBrightnessDistribution(data, 32)
    
    // 2. 天空颜色特征 (32维) - 蓝色vs灰色天空
    const skyColor = this._computeSkyColorFeature(data, width, height, 32)
    
    // 3. 高光检测特征 (32维) - 检测积雪/反光区域
    const highlightFeature = this._computeHighlightFeature(data, 32)
    
    // 4. 边缘密度特征 (32维) - 设备边缘清晰度
    const edgeDensity = this._computeEdgeDensityFeature(imageData, 32)
    
    // 5. 纹理对比度特征 (32维) - 晴天阴影vs阴天漫反射
    const textureContrast = this._computeTextureContrastFeature(imageData, 32)
    
    // 6. 局部对比度特征 (32维) - 细节保留度
    const localContrast = this._computeLocalContrastFeature(imageData, 32)
    
    // 合并特征
    const features = new Float32Array(192)
    let idx = 0
    
    // 亮度分布: 32维
    features.set(brightnessDist, idx); idx += 32
    // 天空颜色: 32维
    features.set(skyColor, idx); idx += 32
    // 高光检测: 32维
    features.set(highlightFeature, idx); idx += 32
    // 边缘密度: 32维
    features.set(edgeDensity, idx); idx += 32
    // 纹理对比度: 32维
    features.set(textureContrast, idx); idx += 32
    // 局部对比度: 32维
    features.set(localContrast, idx)
    
    return features
  }

  /**
   * 计算亮度分布特征
   * 划分多个亮度区间，检测天空、高光、阴影占比
   * @param {Uint8ClampedArray} data
   * @param {number} bins
   * @returns {Float32Array}
   */
  _computeBrightnessDistribution(data, bins) {
    const hist = new Float32Array(bins)
    const total = data.length / 4
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b
      const idx = Math.min(Math.floor(brightness / 256 * bins), bins - 1)
      hist[idx]++
    }
    
    // L1 归一化
    const sum = hist.reduce((a, b) => a + b, 0) + 1e-6
    for (let i = 0; i < bins; i++) {
      hist[i] /= sum
    }
    
    return hist
  }

  /**
   * 计算天空颜色特征
   * 检测顶部区域的蓝色成分，区分蓝天vs阴天vs雪天
   * @param {Uint8ClampedArray} data
   * @param {number} width
   * @param {number} height
   * @param {number} bins
   * @returns {Float32Array}
   */
  _computeSkyColorFeature(data, width, height, bins) {
    const hist = new Float32Array(bins)
    
    // 只取顶部 1/3 区域（天空区域）
    const skyHeight = Math.floor(height / 3)
    const skyPixels = skyHeight * width
    
    let bluePixelCount = 0
    
    for (let y = 0; y < skyHeight; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        const r = data[idx], g = data[idx + 1], b = data[idx + 2]
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b
        
        // 跳过太暗或太亮的区域
        if (brightness < 40 || brightness > 240) continue
        
        // 归一化 RGB
        const max = Math.max(r, g, b) + 1
        const bn = b / max
        
        // 检测蓝色程度 (蓝色占主导 = 蓝天)
        const isBlue = b > r * 1.1 && b > g * 1.1
        
        if (isBlue) {
          bluePixelCount++
          const blueStrength = (b - Math.max(r, g)) / 255
          const idx = Math.floor(blueStrength * bins) % bins
          hist[idx]++
        } else {
          // 非蓝色天空（灰色/白色）
          const grayness = 1 - (Math.abs(r - g) + Math.abs(g - b)) / (255 * 2)
          const grayIdx = Math.floor(bins / 2 + grayness * bins / 2) % bins
          hist[grayIdx]++
        }
      }
    }
    
    // L2 归一化
    const sum = hist.reduce((a, b) => a + b, 0) + 1e-6
    for (let i = 0; i < bins; i++) {
      hist[i] /= sum
    }
    
    return hist
  }

  /**
   * 计算高光检测特征
   * 区分：积雪(大片白色高光) vs 无雪 vs 强烈反光
   * @param {Uint8ClampedArray} data
   * @param {number} bins
   * @returns {Float32Array}
   */
  _computeHighlightFeature(data, bins) {
    const hist = new Float32Array(bins)
    
    let highlightCount = 0
    let midtoneCount = 0
    let shadowCount = 0
    
    // 统计不同亮度区域
    const highlightHist = new Float32Array(bins)
    const midtoneHist = new Float32Array(bins)
    const shadowHist = new Float32Array(bins)
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b
      
      // 颜色饱和度（低饱和度 = 白色/灰色）
      const max = Math.max(r, g, b) + 1
      const min = Math.min(r, g, b) + 1
      const saturation = (max - min) / max
      
      if (brightness > 200 && saturation < 0.15) {
        // 高光区域（可能是积雪或反光）
        highlightCount++
        const idx = Math.floor((brightness - 200) / 55 * bins) % bins
        highlightHist[idx]++
      } else if (brightness > 80 && brightness < 180) {
        // 中间调（主要设备区域）
        midtoneCount++
        const idx = Math.floor((brightness - 80) / 100 * bins) % bins
        midtoneHist[idx]++
      } else if (brightness < 60) {
        // 阴影区域
        shadowCount++
        const idx = Math.floor(brightness / 60 * bins) % bins
        shadowHist[idx]++
      }
    }
    
    // 组合特征：各区域占比 + 分布
    const total = highlightCount + midtoneCount + shadowCount + 1e-6
    
    // 前8维：高光区域分布
    for (let i = 0; i < 8; i++) {
      hist[i] = highlightHist[i * 4] / (highlightCount + 1)
    }
    
    // 中间16维：中间调分布
    for (let i = 0; i < 16; i++) {
      hist[8 + i] = midtoneHist[i * 2] / (midtoneCount + 1)
    }
    
    // 后8维：阴影区域分布
    for (let i = 0; i < 8; i++) {
      hist[24 + i] = shadowHist[i * 4] / (shadowCount + 1)
    }
    
    // L2 归一化
    const sum = hist.reduce((a, b) => a + b, 0) + 1e-6
    for (let i = 0; i < bins; i++) {
      hist[i] /= sum
    }
    
    return hist
  }

  /**
   * 计算边缘密度特征
   * 晴天边缘清晰，阴天边缘模糊
   * @param {ImageData} imageData
   * @param {number} bins
   * @returns {Float32Array}
   */
  _computeEdgeDensityFeature(imageData, bins) {
    const { data, width, height } = imageData
    const gray = new Uint8Array(width * height)
    
    for (let i = 0; i < data.length; i += 4) {
      gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    }
    
    const hist = new Float32Array(bins)
    
    // Sobel 边缘检测
    const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1]
    const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1]
    
    const edgeMagnitudes = []
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sumX = 0, sumY = 0
        
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const kidx = (ky + 1) * 3 + (kx + 1)
            const pixel = gray[(y + ky) * width + (x + kx)]
            sumX += gx[kidx] * pixel
            sumY += gy[kidx] * pixel
          }
        }
        
        const magnitude = Math.sqrt(sumX * sumX + sumY * sumY)
        edgeMagnitudes.push(magnitude)
      }
    }
    
    // 计算边缘强度分布
    const maxMag = Math.max(...edgeMagnitudes) + 1e-6
    
    for (const mag of edgeMagnitudes) {
      const normalizedMag = mag / maxMag
      const idx = Math.min(Math.floor(normalizedMag * bins), bins - 1)
      hist[idx]++
    }
    
    // 归一化
    const sum = hist.reduce((a, b) => a + b, 0) + 1e-6
    for (let i = 0; i < bins; i++) {
      hist[i] /= sum
    }
    
    return hist
  }

  /**
   * 计算纹理对比度特征
   * 晴天有清晰阴影对比，阴天漫反射
   * @param {ImageData} imageData
   * @param {number} bins
   * @returns {Float32Array}
   */
  _computeTextureContrastFeature(imageData, bins) {
    const { data, width, height } = imageData
    const gray = new Uint8Array(width * height)
    
    for (let i = 0; i < data.length; i += 4) {
      gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    }
    
    const hist = new Float32Array(bins)
    const blockSize = 16
    
    // 计算每个小块的局部对比度
    const contrasts = []
    
    for (let by = 0; by < height - blockSize; by += blockSize) {
      for (let bx = 0; bx < width - blockSize; bx += blockSize) {
        let min = 255, max = 0, sum = 0, count = 0
        
        for (let y = by; y < by + blockSize; y++) {
          for (let x = bx; x < bx + blockSize; x++) {
            const val = gray[y * width + x]
            min = Math.min(min, val)
            max = Math.max(max, val)
            sum += val
            count++
          }
        }
        
        const contrast = (max - min) / 255
        const mean = sum / count / 255
        contrasts.push({ contrast, mean })
      }
    }
    
    // 统计对比度分布
    for (const { contrast } of contrasts) {
      const idx = Math.min(Math.floor(contrast * bins), bins - 1)
      hist[idx]++
    }
    
    // 归一化
    const sum = hist.reduce((a, b) => a + b, 0) + 1e-6
    for (let i = 0; i < bins; i++) {
      hist[i] /= sum
    }
    
    return hist
  }

  /**
   * 计算局部对比度特征（检测细节保留度）
   * @param {ImageData} imageData
   * @param {number} bins
   * @returns {Float32Array}
   */
  _computeLocalContrastFeature(imageData, bins) {
    const { data, width, height } = imageData
    const gray = new Uint8Array(width * height)
    
    for (let i = 0; i < data.length; i += 4) {
      gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    }
    
    const hist = new Float32Array(bins)
    const localHist = new Float32Array(bins)
    
    // 使用 Laplacian 检测细节
    const laplacian = [0, 1, 0, 1, -4, 1, 0, 1, 0]
    
    let detailSum = 0
    let count = 0
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let lapSum = 0
        
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const kidx = (ky + 1) * 3 + (kx + 1)
            const pixel = gray[(y + ky) * width + (x + kx)]
            lapSum += laplacian[kidx] * pixel
          }
        }
        
        const absLap = Math.abs(lapSum)
        detailSum += absLap
        count++
        
        const idx = Math.min(Math.floor(absLap / 128 * bins), bins - 1)
        hist[idx]++
      }
    }
    
    // 平均细节度
    const avgDetail = detailSum / count / 255
    
    // 填充特征
    for (let i = 0; i < bins - 1; i++) {
      localHist[i] = hist[i] / (count + 1)
    }
    localHist[bins - 1] = avgDetail
    
    return localHist
  }

  /**
   * 计算光照敏感相似度
   * 专门用于区分：晴天vs阴天、有雪vs无雪、强烈光照vs弱光
   * @param {Float32Array} f1
   * @param {Float32Array} f2
   * @returns {object} {score, details}
   */
  computeIlluminationSensitiveSimilarity(f1, f2) {
    // 各维度权重（可调）
    const weights = {
      brightness: 0.15,     // 亮度分布
      skyColor: 0.25,       // 天空颜色（最重要）
      highlight: 0.25,      // 高光检测（最重要，区分有雪/无雪）
      edgeDensity: 0.15,    // 边缘密度
      textureContrast: 0.10, // 纹理对比度
      localContrast: 0.10   // 局部对比度
    }
    
    const getDimSim = (start, end) => {
      let dot = 0, n1 = 0, n2 = 0
      for (let i = start; i < end; i++) {
        dot += f1[i] * f2[i]
        n1 += f1[i] * f1[i]
        n2 += f2[i] * f2[i]
      }
      return (dot / (Math.sqrt(n1) * Math.sqrt(n2) + 1e-10) + 1) / 2
    }
    
    const brightnessSim = getDimSim(0, 32)
    const skyColorSim = getDimSim(32, 64)
    const highlightSim = getDimSim(64, 96)
    const edgeDensitySim = getDimSim(96, 128)
    const textureContrastSim = getDimSim(128, 160)
    const localContrastSim = getDimSim(160, 192)
    
    // 加权相似度
    const score = 
      brightnessSim * weights.brightness +
      skyColorSim * weights.skyColor +
      highlightSim * weights.highlight +
      edgeDensitySim * weights.edgeDensity +
      textureContrastSim * weights.textureContrast +
      localContrastSim * weights.localContrast
    
    return {
      score,
      details: {
        brightness: brightnessSim,
        skyColor: skyColorSim,
        highlight: highlightSim,
        edgeDensity: edgeDensitySim,
        textureContrast: textureContrastSim,
        localContrast: localContrastSim
      }
    }
  }

  /**
   * 提取图片的内容特征向量
   * 特征组成：颜色直方图 + 边缘方向直方图 + 空间金字塔 + 纹理统计
   * @param {ImageBitmap|HTMLImageElement} image
   * @returns {Promise<Float32Array>} 128维特征向量
   */
  async extractContentFeatures(image) {
    // 缩放到统一尺寸计算
    const size = 128
    const canvas = new OffscreenCanvas(size, size)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0, size, size)
    
    const imageData = ctx.getImageData(0, 0, size, size)
    const { data, width, height } = imageData
    
    // 转灰度
    const gray = new Uint8Array(width * height)
    for (let i = 0; i < data.length; i += 4) {
      gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    }
    
    // 1. 颜色直方图 (32维) - HSV空间，去光照影响
    const colorHist = this._computeColorHistogram(data, 32)
    
    // 2. 边缘方向直方图 (32维) - 捕捉形状/结构
    const edgeHist = this._computeEdgeHistogram(gray, width, height, 32)
    
    // 3. 空间金字塔特征 (32维) - 4x4网格的梯度统计
    const spatialPyramid = this._computeSpatialPyramid(gray, width, height, 32)
    
    // 4. 纹理统计特征 (32维) - 对比度/均匀度等
    const textureStats = this._computeTextureStats(gray, width, height, 32)
    
    // 合并所有特征，并应用权重调整
    // 降低颜色权重(0.5)，大幅提高边缘/纹理权重(1.3)，增强对光照变化的鲁棒性
    const features = new Float32Array(128)
    
    for (let i = 0; i < 32; i++) {
      features[i] = colorHist[i] * 0.5           // 颜色: 0.5 (降低)
      features[i + 32] = edgeHist[i] * 1.3      // 边缘: 1.3 (提高)
      features[i + 64] = spatialPyramid[i] * 1.0 // 空间: 1.0
      features[i + 96] = textureStats[i] * 1.3   // 纹理: 1.3 (提高)
    }
    
    return features
  }

  /**
   * 计算颜色直方图 (抗光照干扰版)
   * 使用归一化 RGB + 亮度无关的颜色角
   * @param {Uint8ClampedArray} data - RGBA像素数据
   * @param {number} bins - 直方图 bins 数
   * @returns {Float32Array}
   */
  _computeColorHistogram(data, bins) {
    const hist = new Float32Array(bins)
    const total = data.length / 4
    
    // 使用色相 (Hue) 和 归一化颜色 抗光照
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      
      // 计算亮度
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b
      
      // 如果太暗或太亮，跳过（不贡献颜色信息）
      if (luminance < 20 || luminance > 235) continue
      
      // 归一化颜色 (去除亮度影响)
      const max = Math.max(r, g, b) + 1
      const rn = r / max, gn = g / max, bn = b / max
      
      // 使用颜色角作为特征
      const angle = Math.atan2(gn - 0.5, rn - 0.5) + Math.PI
      const idx = Math.floor((angle / (2 * Math.PI)) * bins) % bins
      hist[idx]++
    }
    
    // L2 归一化
    const sum = hist.reduce((a, b) => a + b, 0) + 1e-6
    for (let i = 0; i < bins; i++) {
      hist[i] /= sum
    }
    
    return hist
  }

  /**
   * 计算边缘方向直方图 (形状特征)
   * @param {Uint8Array} gray - 灰度图
   * @param {number} width
   * @param {number} height
   * @param {number} bins
   * @returns {Float32Array}
   */
  _computeEdgeHistogram(gray, width, height, bins) {
    const hist = new Float32Array(bins)
    
    // Sobel 算子
    const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1]
    const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1]
    
    let edgeCount = 0
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sumX = 0, sumY = 0
        
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = (ky + 1) * 3 + (kx + 1)
            const pixel = gray[(y + ky) * width + (x + kx)]
            sumX += gx[idx] * pixel
            sumY += gy[idx] * pixel
          }
        }
        
        const magnitude = Math.sqrt(sumX * sumX + sumY * sumY)
        
        // 只处理显著边缘
        if (magnitude > 30) {
          const angle = Math.atan2(sumY, sumX)
          const normalizedAngle = (angle + Math.PI) / (2 * Math.PI)  // 0-1
          const idx = Math.floor(normalizedAngle * bins) % bins
          hist[idx] += magnitude
          edgeCount++
        }
      }
    }
    
    // 归一化
    if (edgeCount > 0) {
      for (let i = 0; i < bins; i++) {
        hist[i] /= edgeCount
      }
    }
    
    return hist
  }

  /**
   * 计算空间金字塔特征 (位置+梯度)
   * @param {Uint8Array} gray
   * @param {number} width
   * @param {number} height
   * @param {number} bins - 总 bins 数
   * @returns {Float32Array}
   */
  _computeSpatialPyramid(gray, width, height, bins) {
    // 4x4 网格，每个网格统计梯度的均值和方差
    const gridSize = 4
    const cellW = width / gridSize
    const cellH = height / gridSize
    const statsPerCell = bins / (gridSize * gridSize)  // 每个格子2维: 均值+方差
    
    const features = new Float32Array(bins)
    
    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const startX = gx * cellW
        const startY = gy * cellH
        const endX = Math.min(startX + cellW, width - 1)
        const endY = Math.min(startY + cellH, height - 1)
        
        let sum = 0, sumSq = 0, count = 0
        
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const val = gray[y * width + x]
            sum += val
            sumSq += val * val
            count++
          }
        }
        
        if (count > 0) {
          const mean = sum / count
          const variance = (sumSq / count) - (mean * mean)
          
          const featIdx = (gy * gridSize + gx) * statsPerCell
          features[featIdx] = mean / 255
          features[featIdx + 1] = Math.sqrt(variance) / 255
        }
      }
    }
    
    return features
  }

  /**
   * 计算纹理统计特征
   * 简化版 GLCM 特征: 对比度、均匀度、熵等
   * @param {Uint8Array} gray
   * @param {number} width
   * @param {number} height
   * @param {number} bins
   * @returns {Float32Array}
   */
  _computeTextureStats(gray, width, height, bins) {
    const features = new Float32Array(bins)
    
    // 1. 灰度共生矩阵 (简化版)
    const levels = 16  // 量化级别
    const quantized = new Uint8Array(gray.length)
    for (let i = 0; i < gray.length; i++) {
      quantized[i] = Math.floor(gray[i] / 16)
    }
    
    // 计算相邻像素的共生频率
    const glcm = new Float32Array(levels * levels)
    let pairCount = 0
    
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const i = quantized[y * width + x]
        const j = quantized[y * width + x + 1]  // 水平相邻
        glcm[i * levels + j]++
        pairCount++
      }
    }
    
    if (pairCount > 0) {
      for (let i = 0; i < glcm.length; i++) {
        glcm[i] /= pairCount
      }
    }
    
    // 2. 计算纹理特征
    // 对比度
    let contrast = 0
    for (let i = 0; i < levels; i++) {
      for (let j = 0; j < levels; j++) {
        contrast += glcm[i * levels + j] * Math.abs(i - j)
      }
    }
    features[0] = contrast / levels
    
    // 均匀度 (Angular Second Moment)
    let asm = 0
    for (let i = 0; i < glcm.length; i++) {
      asm += glcm[i] * glcm[i]
    }
    features[1] = asm
    
    // 熵
    let entropy = 0
    for (let i = 0; i < glcm.length; i++) {
      if (glcm[i] > 0) {
        entropy -= glcm[i] * Math.log2(glcm[i] + 1e-10)
      }
    }
    features[2] = entropy / Math.log2(levels * levels)
    
    // 相关性
    let meanI = 0, meanJ = 0, stdI = 0, stdJ = 0
    for (let i = 0; i < levels; i++) {
      for (let j = 0; j < levels; j++) {
        meanI += i * glcm[i * levels + j]
        meanJ += j * glcm[i * levels + j]
      }
    }
    meanI /= levels; meanJ /= levels
    
    for (let i = 0; i < levels; i++) {
      for (let j = 0; j < levels; j++) {
        stdI += glcm[i * levels + j] * Math.pow(i - meanI, 2)
        stdJ += glcm[i * levels + j] * Math.pow(j - meanJ, 2)
      }
    }
    stdI = Math.sqrt(stdI); stdJ = Math.sqrt(stdJ)
    
    let corr = 0
    for (let i = 0; i < levels; i++) {
      for (let j = 0; j < levels; j++) {
        if (stdI > 0 && stdJ > 0) {
          corr += glcm[i * levels + j] * (i - meanI) * (j - meanJ) / (stdI * stdJ)
        }
      }
    }
    features[3] = (corr + 1) / 2  // 归一化到 0-1
    
    // 3. 填充剩余特征位 (使用图像统计)
    // 分块统计
    const blockCount = 8
    const blockSize = gray.length / blockCount
    for (let b = 0; b < blockCount && b + 4 < bins; b++) {
      let sum = 0
      const start = b * blockSize
      const end = Math.min(start + blockSize, gray.length)
      for (let i = start; i < end; i++) {
        sum += gray[i]
      }
      features[b + 4] = (sum / (end - start)) / 255
    }
    
    // 剩余位置用梯度统计填充
    let gradSum = 0, gradCount = 0
    for (let i = width; i < gray.length - width; i++) {
      const grad = Math.abs(gray[i] - gray[i - 1]) + Math.abs(gray[i] - gray[i - width])
      gradSum += grad
      gradCount++
    }
    features[bins - 2] = (gradSum / gradCount) / 255  // 平均梯度
    
    // 亮度标准差
    let meanBrightness = gray.reduce((a, b) => a + b, 0) / gray.length
    let varianceBrightness = gray.reduce((a, b) => a + Math.pow(b - meanBrightness, 2), 0) / gray.length
    features[bins - 1] = Math.sqrt(varianceBrightness) / 128
    
    return features
  }

  /**
   * 计算两个内容特征的相似度
   * @param {Float32Array} f1
   * @param {Float32Array} f2
   * @returns {number} 0-1 的相似度
   */
  computeContentSimilarity(f1, f2) {
    // 使用余弦相似度
    let dot = 0, norm1 = 0, norm2 = 0
    for (let i = 0; i < f1.length; i++) {
      dot += f1[i] * f2[i]
      norm1 += f1[i] * f1[i]
      norm2 += f2[i] * f2[i]
    }
    const cosSim = dot / (Math.sqrt(norm1) * Math.sqrt(norm2) + 1e-10)
    
    // 余弦相似度范围 [-1, 1]，映射到 [0, 1]
    return (cosSim + 1) / 2
  }

  /**
   * 计算差异敏感的内容相似度
   * 只用边缘+纹理特征，忽略颜色差异
   * 适用于光照变化、天气变化等场景
   * @param {Float32Array} f1
   * @param {Float32Array} f2
   * @returns {number} 0-1 的相似度
   */
  computeDiffAwareSimilarity(f1, f2) {
    // 只取边缘(32-63)、空间(64-95)、纹理(96-127)特征
    // 排除颜色特征(0-31)
    let dot = 0, norm1 = 0, norm2 = 0
    
    // 边缘 + 空间 + 纹理 = 96维
    for (let i = 32; i < 128; i++) {
      dot += f1[i] * f2[i]
      norm1 += f1[i] * f1[i]
      norm2 += f2[i] * f2[i]
    }
    
    const cosSim = dot / (Math.sqrt(norm1) * Math.sqrt(norm2) + 1e-10)
    return (cosSim + 1) / 2
  }

  /**
   * 只用边缘方向直方图计算相似度
   * 最抗光照变化，只关注形状结构
   * @param {Float32Array} f1
   * @param {Float32Array} f2
   * @returns {number} 0-1 的相似度
   */
  computeEdgeOnlySimilarity(f1, f2) {
    // 只取边缘特征(32-63)，32维
    let dot = 0, norm1 = 0, norm2 = 0
    
    for (let i = 32; i < 64; i++) {
      dot += f1[i] * f2[i]
      norm1 += f1[i] * f1[i]
      norm2 += f2[i] * f2[i]
    }
    
    const cosSim = dot / (Math.sqrt(norm1) * Math.sqrt(norm2) + 1e-10)
    return (cosSim + 1) / 2
  }

  /**
   * 使用光照敏感特征判断是否重复
   * 专门区分：晴天/阴天、有雪/无雪、不同光照条件
   * @param {ImageBitmap|HTMLImageElement} image1
   * @param {ImageBitmap|HTMLImageElement} image2
   * @returns {Promise<{similar: boolean, score: number, details: object, reason: string}>}
   */
  async checkIlluminationDuplicate(image1, image2) {
    const features1 = await this.extractIlluminationSensitiveFeatures(image1)
    const features2 = await this.extractIlluminationSensitiveFeatures(image2)
    
    const result = this.computeIlluminationSensitiveSimilarity(features1, features2)
    
    // 判断阈值（光照敏感模式需要更高的阈值来保留差异）
    const threshold = 0.90  // 提高阈值，减少误判
    
    let reason
    if (result.score > 0.98) {
      reason = '光照条件几乎相同，可能是连拍重复'
    } else if (result.score > 0.95) {
      reason = '光照条件高度相似'
    } else if (result.score > threshold) {
      reason = '光照条件相似，可考虑保留'
    } else {
      reason = `光照条件明显不同 (天空: ${(result.details.skyColor*100).toFixed(1)}%, 高光: ${(result.details.highlight*100).toFixed(1)}%)`
    }
    
    return {
      similar: result.score > threshold,
      score: result.score,
      details: result.details,
      reason
    }
  }

  /**
   * 分解特征并计算各维度相似度
   * @param {Float32Array} f1
   * @param {Float32Array} f2
   * @returns {object} 各维度相似度
   */
  analyzeFeatureSimilarity(f1, f2) {
    const getSim = (start, end) => {
      let dot = 0, n1 = 0, n2 = 0
      for (let i = start; i < end; i++) {
        dot += f1[i] * f2[i]
        n1 += f1[i] * f1[i]
        n2 += f2[i] * f2[i]
      }
      return (dot / (Math.sqrt(n1) * Math.sqrt(n2) + 1e-10) + 1) / 2
    }
    
    return {
      color: getSim(0, 32),
      edge: getSim(32, 64),
      spatial: getSim(64, 96),
      texture: getSim(96, 128)
    }
  }

  /**
   * 使用内容特征判断是否重复 (务实版)
   * 不依赖标注、不依赖检测器
   * @param {ImageBitmap|HTMLImageElement} image1
   * @param {ImageBitmap|HTMLImageElement} image2
   * @returns {Promise<{similar: boolean, score: number, reason: string}>}
   */
  async checkContentDuplicate(image1, image2) {
    const features1 = await this.extractContentFeatures(image1)
    const features2 = await this.extractContentFeatures(image2)
    
    const score = this.computeContentSimilarity(features1, features2)
    
    // 阈值说明:
    // > 0.95: 几乎完全相同 (连拍重复)
    // 0.85-0.95: 高度相似 (可能是同一场景)
    // 0.70-0.85: 中度相似 (可保留，作为数据增强候选)
    // < 0.70: 内容不同 (保留)
    
    let reason
    if (score > 0.95) {
      reason = '内容几乎完全相同'
    } else if (score > 0.85) {
      reason = '场景高度相似'
    } else if (score > 0.70) {
      reason = '有相似特征，可作为增强候选'
    } else {
      reason = '内容不同'
    }
    
    return {
      similar: score > this.contentThreshold,  // 默认 0.85
      score,
      reason
    }
  }

  /**
   * 批量提取图片内容特征
   * @param {FileList|Array} files
   * @param {Function} onProgress
   * @returns {Promise<Array>} [{file, features, hash}]
   */
  async extractBatchFeatures(files, onProgress = null) {
    const results = []
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      try {
        const bitmap = await createImageBitmap(file)
        const features = await this.extractContentFeatures(bitmap)
        const pHash = await this.computePHash(bitmap)
        
        results.push({
          file,
          features,
          hash: pHash,
          bitmap
        })
        
        bitmap.close()
      } catch (e) {
        console.warn(`特征提取失败: ${file.name}`, e)
      }
      
      if (onProgress) {
        onProgress(i + 1, files.length)
      }
    }
    
    return results
  }

  /**
   * 基于内容特征进行去重 (务实版入口)
   * @param {Array} samples - [{file, features, hash}]
   * @param {number} contentThreshold - 内容相似度阈值，默认 0.85
   * @param {object} options - 选项
   * @param {string} options.mode - 去重模式: 
   *   - 'full': 全特征模式
   *   - 'diffAware': 差异敏感模式（忽略颜色）
   *   - 'edgeOnly': 只用边缘
   *   - 'illumination': 光照敏感模式（区分晴天/阴天/有雪/无雪）
   * @param {Function} options.onDuplicate - 重复时的回调 (sample1, sample2, details)
   * @param {Function} options.onIlluminationDiff - 当检测到光照差异时的回调
   * @returns {Promise<Array>} 保留的样本索引
   */
  async deduplicateByContent(samples, contentThreshold = 0.85, options = {}) {
    const {
      mode = 'diffAware',  // 默认差异敏感模式
      onDuplicate = null,
      onIlluminationDiff = null
    } = options
    
    this.contentThreshold = contentThreshold
    const keepIndices = []
    
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i]
      let isDuplicate = false
      let duplicateDetails = null
      
      // 检查是否与已保留的样本重复
      for (const keepIdx of keepIndices) {
        const keepSample = samples[keepIdx]
        
        // 1. 先检查像素级重复 (pHash)
        const pHashSim = this.similarity(sample.hash, keepSample.hash)
        if (pHashSim > 0.98) {
          isDuplicate = true
          duplicateDetails = { pHashSim, reason: '像素几乎相同' }
          break
        }
        
        // 2. 光照敏感模式
        if (mode === 'illumination') {
          if (!sample.illuminationFeatures) {
            sample.illuminationFeatures = await this.extractIlluminationSensitiveFeatures(sample.bitmap)
          }
          if (!keepSample.illuminationFeatures) {
            keepSample.illuminationFeatures = await this.extractIlluminationSensitiveFeatures(keepSample.bitmap)
          }
          
          const illumResult = this.computeIlluminationSensitiveSimilarity(
            sample.illuminationFeatures, 
            keepSample.illuminationFeatures
          )
          
          // 光照敏感模式：更宽松的阈值
          if (illumResult.score > 0.95) {
            // 光照条件相似，可能重复
            isDuplicate = true
            duplicateDetails = {
              contentSim: illumResult.score,
              illuminationDetails: illumResult.details,
              reason: `光照条件高度相似 (${(illumResult.score * 100).toFixed(1)}%)`,
              mode
            }
          } else {
            // 光照条件明显不同，不去重
            if (onIlluminationDiff) {
              onIlluminationDiff(sample, keepSample, illumResult)
            }
          }
          break
        }
        
        // 3. 其他内容级重复检查
        let contentSim
        switch (mode) {
          case 'edgeOnly':
            // 极端模式：只用边缘方向直方图
            contentSim = this.computeEdgeOnlySimilarity(sample.features, keepSample.features)
            break
          case 'diffAware':
            // 差异敏感模式：忽略颜色
            contentSim = this.computeDiffAwareSimilarity(sample.features, keepSample.features)
            break
          case 'full':
          default:
            // 全特征模式
            contentSim = this.computeContentSimilarity(sample.features, keepSample.features)
        }
        
        if (contentSim > contentThreshold) {
          isDuplicate = true
          
          // 获取各维度相似度详情
          const featureSims = this.analyzeFeatureSimilarity(sample.features, keepSample.features)
          duplicateDetails = { 
            contentSim, 
            featureSims,
            reason: `场景高度相似 (${mode}模式: ${(contentSim * 100).toFixed(1)}%)`,
            mode
          }
          
          if (onDuplicate) {
            onDuplicate(sample, keepSample, duplicateDetails)
          }
          break
        }
      }
      
      if (!isDuplicate) {
        keepIndices.push(i)
      }
    }
    
    return keepIndices
  }

  /**
   * 批量提取光照敏感特征
   * @param {FileList|Array} files
   * @param {Function} onProgress
   * @returns {Promise<Array>} [{file, features, hash, illuminationFeatures}]
   */
  async extractBatchIlluminationFeatures(files, onProgress = null) {
    const results = []
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      try {
        const bitmap = await createImageBitmap(file)
        const features = await this.extractContentFeatures(bitmap)
        const illuminationFeatures = await this.extractIlluminationSensitiveFeatures(bitmap)
        const pHash = await this.computePHash(bitmap)
        
        results.push({
          file,
          features,
          illuminationFeatures,
          hash: pHash,
          bitmap
        })
        
        bitmap.close()
      } catch (e) {
        console.warn(`特征提取失败: ${file.name}`, e)
      }
      
      if (onProgress) {
        onProgress(i + 1, files.length)
      }
    }
    
    return results
  }
}
