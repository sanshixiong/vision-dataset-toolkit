import * as exifr from 'exifr'

const EXIF_DATE_FIELDS = [
  'DateTimeOriginal',
  'DateTimeDigitized',
  'CreateDate',
  '36867',
  '36868'
]

/**
 * 读取图片 EXIF 元数据，适用于检测前的时间、设备、位置等信息预处理。
 * @param {File|Blob|ArrayBuffer|Uint8Array|string} imageSource
 * @returns {Promise<Object>}
 */
export async function readImageMetadata(imageSource) {
  if (!imageSource) {
    return createEmptyMetadata()
  }

  try {
    const metadata = await exifr.parse(imageSource, {
      tiff: true,
      ifd0: true,
      exif: true,
      gps: true,
      xmp: true,
      iptc: true,
      reviveValues: true,
      translateValues: false,
      translateKeys: true,
      mergeOutput: true
    })

    return normalizeImageMetadata(imageSource, metadata || {})
  } catch (error) {
    return {
      ...createEmptyMetadata(imageSource),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * 读取图片创建时间，仅使用 EXIF 拍摄/创建时间字段。
 * @param {File|Blob|ArrayBuffer|Uint8Array|string} imageSource
 * @returns {Promise<Date|null>}
 */
export async function readImageCreatedAt(imageSource) {
  const metadata = await readImageMetadata(imageSource)
  return metadata.createdAt
}

/**
 * 生成可供检测前处理使用的轻量摘要，避免业务层直接依赖 EXIF 字段名。
 * @param {File|Blob|ArrayBuffer|Uint8Array|string} imageSource
 * @returns {Promise<Object>}
 */
export async function readImagePreprocessMetadata(imageSource) {
  const metadata = await readImageMetadata(imageSource)

  return {
    createdAt: metadata.createdAt,
    createdAtSource: metadata.createdAtSource,
    fileName: metadata.file.name,
    fileSize: metadata.file.size,
    mimeType: metadata.file.type,
    camera: metadata.camera,
    orientation: metadata.orientation,
    gps: metadata.gps,
    hasExif: metadata.hasExif,
    error: metadata.error
  }
}

export function normalizeImageMetadata(imageSource, raw = {}) {
  const fileInfo = getFileInfo(imageSource)
  const createdAtInfo = getCreatedAtInfo(raw, fileInfo)

  return {
    raw,
    hasExif: Object.keys(raw).length > 0,
    createdAt: createdAtInfo.value,
    createdAtSource: createdAtInfo.source,
    file: fileInfo,
    camera: {
      make: raw.Make || '',
      model: raw.Model || '',
      lensModel: raw.LensModel || '',
      software: raw.Software || ''
    },
    image: {
      width: raw.ExifImageWidth || raw.ImageWidth || raw.PixelXDimension || null,
      height: raw.ExifImageHeight || raw.ImageHeight || raw.PixelYDimension || null
    },
    orientation: raw.Orientation || null,
    gps: normalizeGps(raw),
    exposure: {
      iso: raw.ISO || null,
      aperture: raw.FNumber || null,
      exposureTime: raw.ExposureTime || null,
      focalLength: raw.FocalLength || null
    }
  }
}

function createEmptyMetadata(imageSource = null) {
  const fileInfo = getFileInfo(imageSource)

  return {
    raw: {},
    hasExif: false,
    createdAt: null,
    createdAtSource: '',
    file: fileInfo,
    camera: {
      make: '',
      model: '',
      lensModel: '',
      software: ''
    },
    image: {
      width: null,
      height: null
    },
    orientation: null,
    gps: null,
    exposure: {
      iso: null,
      aperture: null,
      exposureTime: null,
      focalLength: null
    }
  }
}

function getCreatedAtInfo(raw, fileInfo) {
  for (const field of EXIF_DATE_FIELDS) {
    const date = normalizeDate(raw[field])
    if (date) {
      return {
        value: date,
        source: field
      }
    }
  }

  return {
    value: null,
    source: ''
  }
}

function normalizeDate(value) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value

  if (typeof value === 'string') {
    const normalized = value.includes('T')
      ? value
      : value.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(' ', 'T')
    const date = new Date(normalized)
    return Number.isNaN(date.getTime()) ? null : date
  }

  return null
}

function normalizeGps(raw) {
  const latitude = getGpsCoordinate(raw.latitude ?? raw.GPSLatitude, raw.GPSLatitudeRef)
  const longitude = getGpsCoordinate(raw.longitude ?? raw.GPSLongitude, raw.GPSLongitudeRef)

  if (latitude === null || longitude === null) {
    return null
  }

  return {
    latitude,
    longitude,
    altitude: getNumber(raw.altitude ?? raw.GPSAltitude)
  }
}

function getGpsCoordinate(value, ref) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizeGpsSign(value, ref)
  }

  if (Array.isArray(value) && value.length >= 3) {
    const degrees = getNumber(value[0])
    const minutes = getNumber(value[1])
    const seconds = getNumber(value[2])

    if (degrees === null || minutes === null || seconds === null) {
      return null
    }

    return normalizeGpsSign(degrees + minutes / 60 + seconds / 3600, ref)
  }

  return null
}

function normalizeGpsSign(value, ref) {
  if (ref === 'S' || ref === 'W') {
    return -Math.abs(value)
  }

  return value
}

function getFileInfo(imageSource) {
  return {
    name: typeof imageSource?.name === 'string' ? imageSource.name : '',
    size: typeof imageSource?.size === 'number' ? imageSource.size : null,
    type: typeof imageSource?.type === 'string' ? imageSource.type : '',
    lastModified: typeof imageSource?.lastModified === 'number' ? imageSource.lastModified : null
  }
}

function getNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
