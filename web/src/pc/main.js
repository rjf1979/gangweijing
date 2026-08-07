import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { showLoading } from './store'
import './styles.css'

// 首屏先显示「正在确认账号状态」，账号与路由就绪后再隐藏
showLoading('正在确认账号状态', '请稍候，马上进入正确页面')

const app = createApp(App)
app.use(router)
app.mount('#app')
