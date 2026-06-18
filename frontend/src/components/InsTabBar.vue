<template>
  <view class="oa-tab-wrap">
    <view class="oa-tab-shell">
      <view
        v-for="item in tabs"
        :key="item.key"
        class="oa-tab-item"
        :class="active === item.key ? 'oa-tab-item-active' : ''"
        @click="switchPage(item.key, item.path)"
      >
        <view class="oa-tab-icon" :class="`oa-tab-icon-${item.key}`"></view>
        <text class="oa-tab-label">{{ item.label }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
const props = defineProps<{
  active: 'practice' | 'collection' | 'profile'
}>()

const tabs = [
  { key: 'practice', label: '刷题', path: '/pages/index/index' },
  { key: 'collection', label: '题集', path: '/pages/collection/index' },
  { key: 'profile', label: '我的', path: '/pages/profile/index' },
] as const

function switchPage(key: string, path: string) {
  if (key === props.active) return
  uni.reLaunch({ url: path })
}
</script>

<style scoped>
.oa-tab-wrap {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
  background: #FFFFFF;
  border-top: 1rpx solid #EEEEEE;
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.04);
  padding-bottom: env(safe-area-inset-bottom);
}

.oa-tab-shell {
  display: flex;
  height: 112rpx;
  justify-content: space-around;
  align-items: center;
  background: #FFFFFF;
}

.oa-tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  color: #999999;
}

.oa-tab-item-active {
  color: #07C160;
}

.oa-tab-icon {
  position: relative;
  width: 48rpx;
  height: 48rpx;
  border: 2rpx solid currentColor;
  border-radius: 8rpx;
  background: transparent;
  box-sizing: border-box;
}

.oa-tab-icon-practice::before {
  content: '';
  position: absolute;
  left: 8rpx;
  right: 8rpx;
  top: 14rpx;
  height: 2rpx;
  background: currentColor;
  border-radius: 8rpx;
}

.oa-tab-icon-practice::after {
  content: '';
  position: absolute;
  left: 8rpx;
  right: 8rpx;
  top: 24rpx;
  height: 2rpx;
  background: currentColor;
  border-radius: 8rpx;
}

.oa-tab-icon-collection::before {
  content: '';
  position: absolute;
  top: 8rpx;
  bottom: 8rpx;
  left: 50%;
  border-left: 2rpx solid currentColor;
  transform: translateX(-50%);
}

.oa-tab-icon-profile {
  border: 0;
}

.oa-tab-icon-profile::before {
  content: '';
  position: absolute;
  left: 15rpx;
  top: 6rpx;
  width: 18rpx;
  height: 18rpx;
  border: 2rpx solid currentColor;
  border-radius: 50%;
  box-sizing: border-box;
}

.oa-tab-icon-profile::after {
  content: '';
  position: absolute;
  left: 8rpx;
  bottom: 5rpx;
  width: 32rpx;
  height: 18rpx;
  border: 2rpx solid currentColor;
  border-top: 0;
  border-radius: 0 0 18rpx 18rpx;
  box-sizing: border-box;
}

.oa-tab-label {
  font-size: 22rpx;
  font-weight: 400;
}

.oa-tab-item-active .oa-tab-label {
  font-weight: 500;
}
</style>

