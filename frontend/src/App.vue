<script lang="ts">
import { bootstrapBackendRecovery } from './utils/app-bootstrap'

const BRAND_PRELOAD_IMAGE_PATHS = [
  '/static/niuma-logo-transparent-lite.webp',
  '/static/niuma13-2-lite.webp',
  '/static/cowpngpng.png',
  '/static/horsepngpng.png',
]

function preloadBrandImages(): void {
  BRAND_PRELOAD_IMAGE_PATHS.forEach((src) => {
    uni.getImageInfo({
      src,
      success: () => {
        // warm image decode/cache for first paint
      },
      fail: () => {
        // ignore preload failure, runtime image fallback still works
      },
    })
  })
}

export default {
  globalData: {
    isFromGuide: false,
    hasDismissedTagGuide: false,
    tempInputContent: '',
  },
  onLaunch() {
    preloadBrandImages()
    void bootstrapBackendRecovery()
  },
  onShow() {
    // app show
  },
  onHide() {
    // app hide
  },
}
</script>

<style>
@import './app.wxss';

page {
  --oa-title: #1A1A1A;
  --oa-text: #3C4043;
  --oa-sub: #70757A;
  --oa-border-color: #E8EAED;
  --oa-radius: 8rpx;
  --oa-card: #ffffff;
  --oa-card-strong: #ffffff;
  --oa-accent: #07C160;
  --oa-accent-2: #07C160;
  --oa-accent-3: #07C160;
  --oa-danger: #cf5656;
  background: #F8F8F8;
  color: var(--oa-text);
  font-family: -apple-system, 'SF Pro Text', 'PingFang SC', 'MiSans', sans-serif;
}

page,
view,
scroll-view,
text,
button,
input,
textarea,
image,
picker,
open-data {
  box-sizing: border-box;
}

/* #ifdef H5 */
::-webkit-scrollbar {
  display: none;
  width: 0 !important;
  height: 0 !important;
  -webkit-appearance: none;
  background: transparent;
}

* {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
/* #endif */

view,
text,
button,
input,
textarea,
scroll-view,
picker {
  font-family: inherit;
  color: inherit;
}

button {
  letter-spacing: 2rpx;
}

button::after {
  border: 0;
}

.oa-page {
  min-height: 100vh;
}

.oa-scroll {
  position: relative;
  min-height: 100vh;
  padding: 0 40rpx calc(env(safe-area-inset-bottom) + 220rpx);
}

.oa-bg {
  display: none;
}

.oa-halo {
  display: none;
}

.oa-halo-a {
  background: transparent;
}

.oa-halo-b {
  background: transparent;
}

.oa-halo-c {
  background: transparent;
}

.oa-header {
  position: relative;
  z-index: 1;
  padding-top: calc(constant(safe-area-inset-top) + 26rpx);
  padding-top: calc(env(safe-area-inset-top) + 26rpx);
  padding-bottom: 22rpx;
}

.oa-kicker {
  display: inline-flex;
  align-items: center;
  padding: 0;
  border-radius: var(--oa-radius);
  font-size: 22rpx;
  color: var(--oa-sub);
  letter-spacing: 0;
  text-transform: none;
  background: transparent;
}

.oa-dot {
  display: none;
}

.oa-title {
  margin-top: 12rpx;
  font-size: 44rpx;
  line-height: 1.12;
  font-weight: 600;
  letter-spacing: 1rpx;
  color: var(--oa-title);
}

.oa-subtitle {
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--oa-sub);
}

.oa-stack {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.oa-card {
  position: relative;
  overflow: hidden;
  border: 1rpx solid var(--oa-border-color);
  border-radius: var(--oa-radius);
  padding: 22rpx;
  background: var(--oa-card);
}

.oa-card-strong {
  background: var(--oa-card-strong);
}

.oa-card-gradient {
  background: #ffffff;
}

.oa-shape {
  display: none;
}

.oa-shape-a {
  background: transparent;
}

.oa-shape-b {
  background: transparent;
}

.oa-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14rpx;
  margin-bottom: 14rpx;
}

.oa-card-title {
  font-size: 30rpx;
  line-height: 1.3;
  font-weight: 600;
  color: var(--oa-title);
}

.oa-note {
  font-size: 22rpx;
  line-height: 1.45;
  color: var(--oa-sub);
  text-align: right;
}

.oa-field {
  border: 1rpx solid var(--oa-border-color);
  border-radius: var(--oa-radius);
  padding: 14rpx 16rpx;
  background: #ffffff;
}

.oa-input,
.oa-textarea,
.oa-picker-label {
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--oa-text);
  font-size: 27rpx;
  line-height: 1.55;
}

.oa-input {
  min-height: 66rpx;
}

.oa-textarea {
  min-height: 230rpx;
}

.oa-picker-label {
  min-height: 66rpx;
  display: flex;
  align-items: center;
}

.oa-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.oa-chip {
  padding: 11rpx 16rpx;
  border: 1rpx solid var(--oa-border-color);
  border-radius: var(--oa-radius);
  font-size: 23rpx;
  line-height: 1.25;
  color: var(--oa-text);
  background: #ffffff;
}

.oa-chip-active {
  border: 1rpx solid var(--oa-accent);
  color: var(--oa-text);
  background: #ffffff;
}

.oa-btn {
  width: 100%;
  min-height: 86rpx;
  border: 1rpx solid var(--oa-accent);
  border-radius: var(--oa-radius);
  font-size: 28rpx;
  font-weight: 600;
  color: #ffffff;
  letter-spacing: 2rpx;
  background: var(--oa-accent);
}

.oa-btn-alt {
  background: #ffffff;
  color: var(--oa-text);
  border-color: var(--oa-border-color);
}

.oa-btn-soft {
  background: #ffffff;
  color: var(--oa-text);
  border-color: var(--oa-border-color);
}

.oa-btn-hover {
  opacity: 0.9;
  transform: scale(0.992);
}

.oa-btn-small {
  width: auto;
  min-height: 62rpx;
  padding: 0 16rpx;
  font-size: 23rpx;
}

.oa-btn[disabled] {
  opacity: 0.5;
}

.oa-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  margin-top: 8rpx;
}

.oa-meta {
  padding: 4rpx 10rpx;
  border: 1rpx solid var(--oa-border-color);
  border-radius: var(--oa-radius);
  font-size: 20rpx;
  color: var(--oa-sub);
  background: #ffffff;
}

.oa-meta-hot {
  color: var(--oa-text);
  background: #ffffff;
  border: 1rpx solid var(--oa-accent);
}

.oa-item {
  margin-top: 12rpx;
  border: 1rpx solid var(--oa-border-color);
  border-radius: var(--oa-radius);
  padding: 18rpx;
  background: #ffffff;
}

.oa-item-title {
  font-size: 28rpx;
  line-height: 1.5;
  font-weight: 600;
}

.oa-item-text {
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.62;
  color: var(--oa-text);
}

.oa-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  margin-top: 12rpx;
}

.oa-empty {
  padding: 24rpx 10rpx 12rpx;
  color: var(--oa-sub);
  font-size: 24rpx;
  line-height: 1.7;
}

.oa-error {
  margin-top: 12rpx;
  max-width: 100%;
  border: 1rpx solid var(--oa-border-color);
  padding: 12rpx 14rpx;
  border-radius: var(--oa-radius);
  background: #ffffff;
  color: #d93025;
  font-size: 23rpx;
  line-height: 1.52;
  word-break: break-all;
  overflow-wrap: anywhere;
  white-space: normal;
}

.oa-break {
  word-break: break-all;
  overflow-wrap: anywhere;
}

.oa-gap-10 {
  margin-top: 10rpx;
}

.oa-gap-14 {
  margin-top: 14rpx;
}

.oa-gap-16 {
  margin-top: 16rpx;
}

.oa-mask {
  position: fixed;
  inset: 0;
  z-index: 110;
  background: rgba(15, 23, 42, 0.22);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0 40rpx calc(env(safe-area-inset-bottom) + 130rpx);
}

.oa-modal {
  width: 100%;
  max-height: 78vh;
  overflow-y: auto;
  border: 1rpx solid var(--oa-border-color);
  border-radius: var(--oa-radius);
  padding: 20rpx;
  background: #ffffff;
}

.oa-modal-title {
  font-size: 30rpx;
  font-weight: 600;
}

.oa-bottom-space {
  height: calc(env(safe-area-inset-bottom) + 20rpx);
}

/* #ifdef MP-WEIXIN */
.oa-scrollbar-stealth {
  width: calc(100% + 24rpx);
  margin-right: -24rpx;
  padding-right: 24rpx;
}
/* #endif */
</style>
