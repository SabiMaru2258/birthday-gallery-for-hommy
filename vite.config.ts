import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  // Base path for GitHub Pages
  // Automatically uses repo name from REPO_NAME env var (set by GitHub Actions)
  // If your repo is at username.github.io (not a project repo), change this to base: '/'
  // For local development, this will be '/'
  base: process.env.REPO_NAME 
    ? `/${process.env.REPO_NAME}/`
    : (process.env.NODE_ENV === 'production' ? '/birthday-gallery-for-hommy/' : '/'),
})
