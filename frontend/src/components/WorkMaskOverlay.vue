<template>
  <view class="work-mask-overlay" @touchmove.stop.prevent>
    <view class="work-mask-card" @tap.stop>
      <view class="work-queue-viewport" aria-hidden="true">
        <view class="work-queue-marquee">
          <view class="work-queue-segment">
            <view
              v-for="(animal, index) in queueAnimals"
              :key="`segment-a-${index}`"
              class="work-queue-hop"
              :style="{ animationDelay: `${(index % 4) * 0.16}s` }"
            >
              <image
                class="work-queue-animal"
                :class="animal === 'horse' ? 'is-horse' : 'is-cow'"
                :src="animal === 'cow' ? COW_SRC : HORSE_SRC"
                mode="aspectFit"
              />
            </view>
          </view>
          <view class="work-queue-segment" aria-hidden="true">
            <view
              v-for="(animal, index) in queueAnimals"
              :key="`segment-b-${index}`"
              class="work-queue-hop"
              :style="{ animationDelay: `${(index % 4) * 0.16 + 0.08}s` }"
            >
              <image
                class="work-queue-animal"
                :class="animal === 'horse' ? 'is-horse' : 'is-cow'"
                :src="animal === 'cow' ? COW_SRC : HORSE_SRC"
                mode="aspectFit"
              />
            </view>
          </view>
        </view>
      </view>

      <view class="work-status-swiper-wrap work-block-gap" :style="{ height: `${STATUS_LINE_HEIGHT_RPX}rpx` }">
        <swiper
          class="work-status-swiper"
          :style="{ height: `${STATUS_LINE_HEIGHT_RPX}rpx` }"
          :vertical="true"
          :autoplay="true"
          :circular="true"
          :interval="2200"
          :duration="280"
          :disable-touch="true"
        >
          <swiper-item v-for="(message, index) in statusMessages" :key="`status-${index}`">
            <view class="work-status-item" :style="{ height: `${STATUS_LINE_HEIGHT_RPX}rpx` }">
              <text class="work-status-text">{{ message }}</text>
            </view>
          </swiper-item>
        </swiper>
      </view>

      <button class="work-cancel-btn work-block-gap" hover-class="work-cancel-btn-hover" @click.stop="emitCancel">
        取消生成
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
const COW_SRC = '/static/cowpngpng.png'
const HORSE_SRC = '/static/horsepngpng.png'
const STATUS_LINE_HEIGHT_RPX = 46
const queueAnimals = ['cow', 'horse', 'cow', 'horse', 'cow', 'horse', 'cow', 'horse'] as const
const statusMessages = [
  'AI牛马正在为你干活，请稍候...',
  'AI牛马正在加班搬砖，请稍候...',
  'AI牛马正在翻资料找答案，请稍候...',
  'AI牛马正在梳理重点，请稍候...',
  'AI牛马正在打磨题目质量，请稍候...',
  'AI牛马正在核对知识点，请稍候...',
  'AI牛马正在排查易错点，请稍候...',
  'AI牛马正在压缩废话，请稍候...',
  'AI牛马正在补充高频考点，请稍候...',
  'AI牛马正在优化题目顺序，请稍候...',
  'AI牛马正在调校难度梯度，请稍候...',
  'AI牛马正在生成标准解析，请稍候...',
  'AI牛马正在校验选项干扰度，请稍候...',
  'AI牛马正在比对最新规则，请稍候...',
  'AI牛马正在清洗噪声信息，请稍候...',
  'AI牛马正在为你精选真题风格，请稍候...',
  'AI牛马正在提炼核心概念，请稍候...',
  'AI牛马正在给你攒一套好题，请稍候...',
  'AI牛马正在补齐知识盲区，请稍候...',
  'AI牛马正在重排训练节奏，请稍候...',
  'AI牛马正在打包你的专属题集，请稍候...',
  'AI牛马正在检查答案一致性，请稍候...',
  'AI牛马正在增强题目区分度，请稍候...',
  'AI牛马正在对齐你的学习目标，请稍候...',
  'AI牛马正在准备下一轮冲刺，请稍候...',
  'AI牛马正在追着截止时间狂奔，请稍候...',
  'AI牛马正在全速推理中，请稍候...',
  'AI牛马正在为你冲业绩，请稍候...',
  'AI牛马正在做最后质检，请稍候...',
  'AI牛马马上交付结果，请稍候...',
] as const

const emit = defineEmits<{
  (event: 'cancel'): void
}>()

function emitCancel() {
  emit('cancel')
}
</script>

<style scoped>
.work-mask-overlay {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  z-index: 99999;
  background: rgba(255, 255, 255, 0.6);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32rpx;
  box-sizing: border-box;
}

.work-mask-card {
  width: 100%;
  max-width: 620rpx;
  background: transparent;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  border: 0;
  border-radius: 16rpx;
  padding: 32rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  box-shadow: none;
}

.work-block-gap {
  margin-top: 24rpx;
}

.work-queue-viewport {
  width: 100%;
  height: 116rpx;
  overflow: hidden;
  position: relative;
}

.work-queue-marquee {
  position: absolute;
  left: 0;
  top: 50%;
  display: flex;
  align-items: center;
  height: 116rpx;
  animation: queueMarquee 8s linear infinite;
  will-change: transform;
}

.work-queue-segment {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
}

.work-queue-hop {
  margin-right: 20rpx;
  flex: 0 0 auto;
  animation: animalHop 0.88s ease-in-out infinite;
  will-change: transform;
}

.work-queue-animal {
  width: 122rpx;
  height: 82rpx;
}

.work-queue-animal.is-horse {
  width: 130rpx;
  height: 84rpx;
}

.work-status-swiper-wrap {
  width: 100%;
  height: 46rpx;
  overflow: hidden;
}

.work-status-swiper {
  width: 100%;
  height: 46rpx;
}

.work-status-item {
  width: 100%;
  height: 46rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.work-status-text {
  display: block;
  width: 100%;
  color: #07C160;
  font-size: 28rpx;
  line-height: 1.3;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  animation: thinkingBreath 1.8s ease-in-out infinite;
}

.work-cancel-btn {
  width: 100%;
  min-height: 80rpx;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 16rpx;
  background: transparent;
  color: #BBBBBB;
  font-size: 28rpx;
  font-weight: 400;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.work-cancel-btn::after {
  border: 0 !important;
}

.work-cancel-btn-hover {
  background: transparent;
  color: #B0B0B0;
}

@keyframes queueMarquee {
  0% {
    transform: translate3d(0, -50%, 0);
  }
  100% {
    transform: translate3d(-50%, -50%, 0);
  }
}

@keyframes animalHop {
  0% {
    transform: translate3d(0, 0, 0) scaleY(1);
  }
  30% {
    transform: translate3d(0, -12rpx, 0) scaleY(1.01);
  }
  55% {
    transform: translate3d(0, -2rpx, 0) scaleY(0.98);
  }
  100% {
    transform: translate3d(0, 0, 0) scaleY(1);
  }
}

@keyframes thinkingBreath {
  0% {
    opacity: 0.8;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.8;
  }
}
</style>
