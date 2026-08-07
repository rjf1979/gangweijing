<script>
export default {
  onLaunch() {},
  onShow() {},
  onHide() {}
}
</script>

<style>
/* 全局公共样式：与 Web 端工具型 Neo-brutalist 视觉语言保持一致 */
page {
  background-color: #f7f5ee;
  color: #111111;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  font-size: 28rpx;
  line-height: 1.6;
}

.page {
  padding: 24rpx 0 60rpx;
  min-height: 100vh;
}

.card {
  background: #ffffff;
  border: 4rpx solid #111111;
  border-radius: 20rpx;
  padding: 32rpx;
  margin: 20rpx 24rpx;
  box-shadow: 8rpx 8rpx 0 rgba(17, 17, 17, 0.92);
}

.card-accent-lime { background: #c7ff3d; }
.card-accent-blue { background: #73c7ff; }
.card-accent-yellow { background: #ffd84d; }
.card-accent-pink { background: #ff8fa3; }

.kicker {
  display: block;
  font-size: 22rpx;
  font-weight: 800;
  letter-spacing: 4rpx;
  color: #4a4a4a;
  margin-bottom: 8rpx;
}

.title {
  display: block;
  font-size: 48rpx;
  font-weight: 900;
  line-height: 1.2;
}

.lead {
  display: block;
  font-size: 34rpx;
  font-weight: 800;
  margin-bottom: 8rpx;
}

.subtitle, .muted {
  display: block;
  font-size: 26rpx;
  color: #4a4a4a;
}

.section-gap { height: 16rpx; }

/* 按钮 */
.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 24rpx;
  padding: 0 32rpx;
  height: 92rpx;
  border: 4rpx solid #111111;
  border-radius: 16rpx;
  background: #ffffff;
  color: #111111;
  font-size: 30rpx;
  font-weight: 800;
  line-height: 84rpx;
  box-shadow: 6rpx 6rpx 0 rgba(17, 17, 17, 0.92);
}
.btn::after { border: none; }
.btn-primary { background: #c7ff3d; }
.btn-blue { background: #73c7ff; }
.btn-pink { background: #ff8fa3; }
.btn-dark { background: #111111; color: #ffffff; }
.btn-ghost { background: transparent; box-shadow: none; border-style: dashed; }
.btn[disabled] { opacity: 0.45; box-shadow: none; }

/* 输入 */
.label {
  display: block;
  font-size: 26rpx;
  font-weight: 800;
  margin: 24rpx 0 8rpx;
}
.input, .textarea {
  width: 100%;
  box-sizing: border-box;
  border: 4rpx solid #111111;
  border-radius: 12rpx;
  background: #ffffff;
  padding: 20rpx;
  font-size: 28rpx;
  color: #111111;
}
.textarea { min-height: 240rpx; }

/* 进度条 */
.progress-wrap {
  margin-top: 24rpx;
  border: 4rpx solid #111111;
  border-radius: 12rpx;
  background: #ffffff;
  overflow: hidden;
  height: 40rpx;
}
.progress-bar {
  height: 100%;
  background: #c7ff3d;
  transition: width 0.2s ease;
}
.progress-bar.is-busy {
  background: repeating-linear-gradient(45deg, #c7ff3d, #c7ff3d 12rpx, #a8e02e 12rpx, #a8e02e 24rpx);
  animation: stripe 0.8s linear infinite;
}
@keyframes stripe {
  0% { background-position: 0 0; }
  100% { background-position: 48rpx 0; }
}
.progress-label {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #4a4a4a;
}

/* 标签 / 徽标 */
.tag {
  display: inline-block;
  border: 3rpx solid #111111;
  border-radius: 8rpx;
  padding: 4rpx 16rpx;
  font-size: 22rpx;
  font-weight: 800;
  margin-right: 12rpx;
  margin-bottom: 12rpx;
}
.tag-lime { background: #c7ff3d; }
.tag-green { background: #79e39a; }
.tag-yellow { background: #ffd84d; }
.tag-pink { background: #ff8fa3; }
.tag-blue { background: #73c7ff; }
.tag-grey { background: #efede6; }

/* 状态提示 */
.error { color: #b3261e; font-size: 26rpx; font-weight: 700; margin-top: 12rpx; }
.success { color: #16794a; font-size: 26rpx; font-weight: 700; margin-top: 12rpx; }

/* ===== PC / 宽屏适配（H5 端，小程序与 App 不触发）===== */
@media screen and (min-width: 768px) {
  .page {
    max-width: 880px;
    margin-left: auto;
    margin-right: auto;
  }
  .card {
    margin-left: 28rpx;
    margin-right: 28rpx;
  }
}
</style>
