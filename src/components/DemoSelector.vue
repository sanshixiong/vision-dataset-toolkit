<template>
  <div class="demo-selector">
    <button
      v-for="demo in demos"
      :key="demo.id"
      :class="['demo-btn', { active: modelValue === demo.id }]"
      @click="$emit('update:modelValue', demo.id)"
    >
      <span class="demo-icon">{{ demo.icon }}</span>
      <span>{{ demo.name }}</span>
    </button>
  </div>
</template>

<script setup>
defineProps({
  demos: {
    type: Array,
    required: true
  },
  modelValue: {
    type: String,
    default: 'basic'
  }
})

defineEmits(['update:modelValue'])
</script>

<style scoped>
.demo-selector {
  display: flex;
  gap: 15px;
  justify-content: center;
  margin-bottom: 30px;
  flex-wrap: wrap;
}

.demo-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border: 2px solid #333;
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 1rem;
}

.demo-btn:hover {
  border-color: #00d4ff;
  background: rgba(0, 212, 255, 0.1);
}

.demo-btn.active {
  border-color: #00d4ff;
  background: rgba(0, 212, 255, 0.2);
}

.demo-icon {
  font-size: 1.5rem;
}
</style>
