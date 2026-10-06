import type { WASIFS } from '../../runno/packages/wasi/lib/types'
import { Tarball } from '@obsidize/tar-browserify'
import { inflate } from 'pako'
import { validateManifest, type ToolchainManifest } from './manifest'

export interface LoaderOptions {
  assetBaseUrl?: string
  /** Set false to disable Cache Storage. Cache failures do not block execution. */
  cache?: boolean
  maxAssetBytes?: number
  maxToolchainBytes?: number
}

export class ToolchainLoader {
  constructor(private readonly options: LoaderOptions = {}) {}

  async load(manifest: ToolchainManifest, signal: AbortSignal): Promise<WASIFS> {
    validateManifest(manifest)
    const total = manifest.assets.reduce((sum, asset) => sum + asset.size, 0)
    if (total > (this.options.maxToolchainBytes ?? 512 * 1024 * 1024)) {
      throw new Error('Toolchain is too large')
    }

    let cache: Cache | undefined
    if (this.options.cache !== false && typeof caches !== 'undefined') {
      try { cache = await caches.open('codedang-toolchains-v1') } catch { /* Optional cache. */ }
    }

    const fs: WASIFS = {}
    for (const asset of manifest.assets) {
      signal.throwIfAborted()
      if (asset.size > (this.options.maxAssetBytes ?? 128 * 1024 * 1024)) {
        throw new Error(`Asset is too large: ${asset.path}`)
      }
      const base = this.options.assetBaseUrl
        ? new URL(this.options.assetBaseUrl, globalThis.location?.href).href
        : globalThis.location
          ? new URL('/runno/langs/', globalThis.location.origin).href
          : undefined
      const url = base ? new URL(asset.url, base) : new URL(asset.url)
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid asset URL')
      const key = new URL(url)
      key.searchParams.set('__sha256', asset.sha256.toLowerCase())

      let bytes: Uint8Array | undefined
      try {
        const cached = await cache?.match(key.href)
        if (cached) {
          const candidate = await readBytes(cached, asset.size, signal)
          await verify(candidate, asset.sha256)
          bytes = candidate
        }
      } catch {
        signal.throwIfAborted()
        try { await cache?.delete(key.href) } catch { /* Optional cache. */ }
      }

      if (!bytes) {
        const response = await fetch(url, { signal, credentials: 'omit' })
        if (!response.ok) throw new Error(`Asset download failed: ${response.status} ${asset.path}`)
        bytes = await readBytes(response, asset.size, signal)
        await verify(bytes, asset.sha256)
        signal.throwIfAborted()
        try {
          await cache?.put(key.href, new Response(bytes as Uint8Array<ArrayBuffer>))
        } catch { /* Quota and storage failures do not block execution. */ }
      }

      signal.throwIfAborted()
      const date = new Date(0)
      if (asset.archive) {
        const tar = asset.archive === 'tar.gz' ? inflate(bytes) : bytes
        const entries = Tarball.extract(tar)
        let expandedSize = 0
        for (const entry of entries) {
          if (!entry.isFile() || !entry.content) continue
          const path = archivePath(entry.fileName)
          expandedSize += entry.content.byteLength
          if (expandedSize > (this.options.maxToolchainBytes ?? 512 * 1024 * 1024)) {
            throw new Error('Extracted toolchain is too large')
          }
          const modified = new Date(entry.lastModified || 0)
          fs[path] = {
            path,
            mode: 'binary',
            content: entry.content,
            timestamps: { access: modified, modification: modified, change: modified }
          }
        }
      } else {
        fs[asset.path] = {
          path: asset.path,
          mode: 'binary',
          content: bytes,
          timestamps: { access: date, modification: date, change: date }
        }
      }
    }
    return fs
  }
}

function archivePath(name: string): string {
  const parts = name.replaceAll('\\', '/').split('/').filter(Boolean)
  if (!parts.length || parts.some(part => part === '.' || part === '..')) {
    throw new Error(`Unsafe toolchain archive path: ${name}`)
  }
  return `/${parts.join('/')}`
}

async function verify(bytes: Uint8Array, expected: string): Promise<void> {
  const hash = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  const actual = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
  if (actual !== expected.toLowerCase()) throw new Error('Asset SHA-256 mismatch')
}

async function readBytes(response: Response, size: number, signal: AbortSignal): Promise<Uint8Array> {
  if (!response.body) throw new Error('Asset response has no body')
  const reader = response.body.getReader()
  const bytes = new Uint8Array(size)
  let offset = 0
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      if (offset + value.length > size) throw new Error('Asset exceeds declared size')
      bytes.set(value, offset)
      offset += value.length
    }
    signal.throwIfAborted()
    if (offset !== size) throw new Error('Asset size mismatch')
    return bytes
  } finally {
    signal.removeEventListener('abort', abort)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
