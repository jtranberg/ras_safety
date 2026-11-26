import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const allowedHosts = (env.VITE_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)

  return {
    plugins: [react()],
    server: {
      allowedHosts,
      // Lets VITE_API_URL=/api reach the local API through the dev server,
      // so remote previews use same-origin requests and cookies.
      proxy: {
        '/api': env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
      },
    },
  }
})
