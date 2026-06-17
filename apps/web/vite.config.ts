import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import { devPorts } from '@zeta/config'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  server: {
    port: devPorts.web,
  },
  plugins: [vue(), command === 'serve' && vueDevTools(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}))
