import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import javaCompiler from '../src/languages/java/toolchain.json'

const toolchainDirectory = fileURLToPath(new URL('../.toolchains/runno/', import.meta.url))
const javaDirectory = fileURLToPath(new URL('../.toolchains/java/', import.meta.url))
const javaAssets = new Set([
  javaCompiler.assets[0].url,
  ...['ecj-sources.jar', 'LICENSE', 'NOTICE'].map(name => `${path.posix.dirname(javaCompiler.assets[0].url)}/${name}`)
])
const availableAssets = new Set([
  'python-3.11.3.wasm',
  'python-3.11.3.tar.gz',
  'clang.wasm',
  'wasm-ld.wasm',
  'clang-fs.tar.gz',
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
        const assetPath = new URL(request.url ?? '/', 'http://localhost').pathname.slice(1)
        const name = path.basename(assetPath)
        const java = javaAssets.has(assetPath)
        if (!java && !availableAssets.has(assetPath)) return next()
        try {
          const bytes = await readFile(path.join(java ? javaDirectory : toolchainDirectory, assetPath))
          response.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.jar') ? 'application/java-archive' : name.endsWith('.gz') ? 'application/gzip' : 'text/plain; charset=utf-8')
          response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
          response.end(bytes)
        } catch (error) { next(error) }
      })
    }
  }]
})
