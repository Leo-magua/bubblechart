import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || process.env.BASE_PATH || '/',
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      "/bubblechartgpt/api": {
        target: "http://127.0.0.1:5050",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bubblechartgpt/, ""),
      },
      "/bubblechartgpt/admin": {
        target: "http://127.0.0.1:5050",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bubblechartgpt/, ""),
      },
      "/api": {
        target: "http://127.0.0.1:5050",
        changeOrigin: true,
      },
      "/admin": {
        target: "http://127.0.0.1:5050",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    host: true,
    proxy: {
      "/bubblechartgpt/api": {
        target: "http://127.0.0.1:5050",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bubblechartgpt/, ""),
      },
      "/bubblechartgpt/admin": {
        target: "http://127.0.0.1:5050",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bubblechartgpt/, ""),
      },
      "/api": {
        target: "http://127.0.0.1:5050",
        changeOrigin: true,
      },
      "/admin": {
        target: "http://127.0.0.1:5050",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
