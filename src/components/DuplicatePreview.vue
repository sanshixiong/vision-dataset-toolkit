<template>
  <div
    v-if="visible && currentItem"
    class="duplicate-dialog"
    @click.self="$emit('close')"
  >
    <div class="duplicate-dialog__content">
      <div class="duplicate-dialog__header">
        <div>
          <h3>重复图片对比</h3>
          <div class="duplicate-dialog__counter">
            当前查看 {{ currentIndex + 1 }}/{{ total }}
          </div>
        </div>
        <button class="duplicate-dialog__close" type="button" @click="$emit('close')">×</button>
      </div>

      <button class="duplicate-dialog__nav duplicate-dialog__nav--prev" type="button" @click="$emit('prev')">
        ‹
      </button>
      <button class="duplicate-dialog__nav duplicate-dialog__nav--next" type="button" @click="$emit('next')">
        ›
      </button>

      <div class="duplicate-dialog__images">
        <div class="duplicate-dialog__image-panel">
          <div class="duplicate-dialog__image-title">当前项</div>
          <img :src="getPreviewUrl(currentItem.file)" :alt="currentItem.fileName" />
          <div class="duplicate-dialog__file-name" :title="currentItem.fileName">
            {{ currentItem.fileName }}
          </div>
        </div>
        <div class="duplicate-dialog__image-panel">
          <div class="duplicate-dialog__image-title">已保留项</div>
          <img :src="getPreviewUrl(currentItem.duplicateFile)" :alt="currentItem.duplicateOf" />
          <div class="duplicate-dialog__file-name" :title="currentItem.duplicateOf">
            {{ currentItem.duplicateOf }}
          </div>
        </div>
      </div>

      <div class="duplicate-dialog__info">
        <div class="duplicate-dialog__info-row">
          <span>判定原因</span>
          <strong>{{ currentItem.dedupeDetails?.reason || currentItem.error }}</strong>
        </div>
        <div class="duplicate-dialog__info-grid">
          <div class="duplicate-dialog__metric" v-if="hasNumber(currentItem.dedupeDetails?.pHashSim)">
            <span>pHash 相似度</span>
            <strong>{{ formatScore(currentItem.dedupeDetails.pHashSim) }}</strong>
          </div>
          <div class="duplicate-dialog__metric" v-if="hasNumber(currentItem.dedupeDetails?.contentSim)">
            <span>内容相似度</span>
            <strong>{{ formatScore(currentItem.dedupeDetails.contentSim) }}</strong>
          </div>
          <div class="duplicate-dialog__metric" v-if="hasNumber(currentItem.dedupeDetails?.sceneSim)">
            <span>场景相似度</span>
            <strong>{{ formatScore(currentItem.dedupeDetails.sceneSim) }}</strong>
          </div>
          <div class="duplicate-dialog__metric" v-if="hasNumber(currentItem.dedupeDetails?.illumination?.similarity)">
            <span>光照相似度</span>
            <strong>{{ formatScore(currentItem.dedupeDetails.illumination.similarity) }}</strong>
          </div>
          <div class="duplicate-dialog__metric" v-if="hasNumber(currentItem.dedupeDetails?.illumination?.distance ?? currentItem.dedupeDetails?.illuminationDistance)">
            <span>光照差异</span>
            <strong>{{ formatScore(currentItem.dedupeDetails?.illumination?.distance ?? currentItem.dedupeDetails?.illuminationDistance) }}</strong>
          </div>
        </div>
        <div class="duplicate-dialog__error" :title="currentItem.error">
          {{ currentItem.error }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  visible: Boolean,
  currentItem: Object,
  currentIndex: Number,
  total: Number,
  getPreviewUrl: {
    type: Function,
    default: () => ''
  }
})

defineEmits(['close', 'prev', 'next'])

function hasNumber(value) {
  return Number.isFinite(value)
}

function formatScore(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '-'
}
</script>

<style scoped>
.duplicate-dialog {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: rgba(0, 0, 0, 0.72);
}

.duplicate-dialog__content {
  position: relative;
  width: min(1180px, 96vw);
  max-height: 92vh;
  overflow: auto;
  padding: 22px 72px 24px;
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
}

.duplicate-dialog__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.duplicate-dialog__header h3 {
  margin: 0 0 6px;
  font-size: 1.25rem;
}

.duplicate-dialog__counter {
  color: #00d4ff;
  font-size: 0.9rem;
}

.duplicate-dialog__close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  cursor: pointer;
  font-size: 1.4rem;
  line-height: 1;
}

.duplicate-dialog__close:hover {
  border-color: #00d4ff;
  background: rgba(0, 212, 255, 0.22);
}

.duplicate-dialog__nav {
  position: absolute;
  top: 45%;
  width: 42px;
  height: 72px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  background: rgba(0, 212, 255, 0.12);
  color: #fff;
  cursor: pointer;
  font-size: 2.4rem;
  line-height: 1;
}

.duplicate-dialog__nav:hover {
  border-color: #00d4ff;
  background: rgba(0, 212, 255, 0.22);
}

.duplicate-dialog__nav--prev {
  left: 18px;
}

.duplicate-dialog__nav--next {
  right: 18px;
}

.duplicate-dialog__images {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.duplicate-dialog__image-panel {
  min-width: 0;
  padding: 12px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.duplicate-dialog__image-title {
  margin-bottom: 8px;
  color: #00d4ff;
  font-size: 0.9rem;
}

.duplicate-dialog__image-panel img {
  display: block;
  width: 100%;
  height: min(52vh, 520px);
  object-fit: contain;
  background: #050505;
  border-radius: 6px;
}

.duplicate-dialog__file-name {
  margin-top: 8px;
  color: #fff;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.duplicate-dialog__info {
  margin-top: 16px;
  padding: 14px;
  background: rgba(0, 0, 0, 0.22);
  border-radius: 8px;
}

.duplicate-dialog__info-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.duplicate-dialog__info-row span,
.duplicate-dialog__metric span {
  color: #888;
}

.duplicate-dialog__info-row strong {
  color: #fff;
  text-align: right;
}

.duplicate-dialog__info-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.duplicate-dialog__metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
}

.duplicate-dialog__metric strong {
  color: #00d4ff;
}

.duplicate-dialog__error {
  margin-top: 12px;
  color: #ff9999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
