import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

const webRoot = process.cwd()

// 岗位镜 PC 版独立构建：源码在 web/src/pc，产物 web/dist/pc，静态前缀 /pc/
export default defineConfig({
  root: path.resolve(webRoot, 'src/pc'),
  plugins: [vue()],
  base: '/pc/',
  build: {
    outDir: path.resolve(webRoot, 'dist/pc'),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3215', changeOrigin: true },
    },
  },
})
