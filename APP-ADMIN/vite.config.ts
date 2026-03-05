import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isMobile = process.env.CAPACITOR_PLATFORM !== undefined
const isGitHubPages = process.env.GITHUB_PAGES === 'true'

export default defineConfig({
  plugins: [react()],
  base: isMobile ? './' : (isGitHubPages ? '/Certify-app/admin/' : './'),
  server: {
    port: 5174
  }
})
