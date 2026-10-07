import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'

const toolchainDirectory = fileURLToPath(new URL('../.toolchains/runno/', import.meta.url))
const javaDirectory = fileURLToPath(new URL('../java/assets/', import.meta.url))
const availableAssets = new Set([
  'python-3.11.3.wasm',
  'python-3.11.3.tar.gz',
  'clang.wasm',
  'wasm-ld.wasm',
  'clang-fs.tar.gz',
  'javac-17.jar'
])

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  esbuild: { jsx: 'automatic' },
  worker: { format: 'es' },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] }
  },
  plugins: [tailwindcss(), {
    name: 'serve-runno-toolchains',
    configureServer(server) {
      server.middlewares.use('/toolchains', async (request, response, next) => {
        const name = path.basename(new URL(request.url ?? '/', 'http://localhost').pathname)
        if (!availableAssets.has(name)) return next()
        try {
          const bytes = await readFile(path.join(name === 'javac-17.jar' ? javaDirectory : toolchainDirectory, name))
          response.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.jar') ? 'application/java-archive' : 'application/gzip')
          response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
          response.end(bytes)
        } catch (error) { next(error) }
      })
    }
  }]
})
