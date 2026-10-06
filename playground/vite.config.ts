import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const toolchainDirectory = fileURLToPath(new URL('../runno/langs/', import.meta.url))
const availableAssets = new Set([
  'python-3.11.3.wasm',
  'python-3.11.3.tar.gz',
  'clang.wasm',
  'wasm-ld.wasm',
  'clang-fs.tar.gz'
])

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] }
  },
  plugins: [{
    name: 'serve-runno-toolchains',
    configureServer(server) {
      server.middlewares.use('/runno/langs', async (request, response, next) => {
        const name = path.basename(new URL(request.url ?? '/', 'http://localhost').pathname)
        if (!availableAssets.has(name)) return next()
        try {
          const bytes = await readFile(path.join(toolchainDirectory, name))
          response.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'application/gzip')
          response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
          response.end(bytes)
        } catch (error) { next(error) }
      })
    }
  }]
})
