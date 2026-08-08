import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

// 岗位镜管理后台：独立桌面端后台，不依赖主站构建链
export default defineConfig({
  root: path.resolve(process.cwd()),
  plugins: [vue()],
  base: '/admin/',
  build: {
    outDir: path.resolve(process.cwd(), 'dist'),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5176,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3216', changeOrigin: true },
    },
  },
})
