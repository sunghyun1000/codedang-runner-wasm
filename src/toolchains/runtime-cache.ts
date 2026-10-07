import type { LoaderOptions } from './loader'
import { cheerpjManifest } from './cheerpj-manifest'
import type { ToolchainAsset } from './manifest'

const cacheName = 'codedang-cheerpj-runtime-v1'

/** Cache CheerpJ fetches, including partial responses, across disposable Workers. */
export function createRuntimeFetch(loaderUrl: string, options: LoaderOptions = {}, network = globalThis.fetch.bind(globalThis)): typeof fetch {
  const root = new URL('.', loaderUrl)
  const assets = new Map(cheerpjManifest(loaderUrl).assets.map(asset => [asset.url, asset]))
  const fullFiles = new Map<string, Promise<Uint8Array | undefined>>()
  return async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (options.cache === false || request.method !== 'GET' || request.headers.has('authorization') ||
        request.credentials === 'include' || url.origin !== root.origin || !url.pathname.startsWith(root.pathname) ||
        request.cache === 'no-store' || request.cache === 'reload' || typeof caches === 'undefined') {
      return network(input, init)
    }
    request.signal.throwIfAborted()
    const asset = assets.get(request.url)
    if (asset) {
      let pending = fullFiles.get(request.url)
      if (!pending) {
        pending = readFullAsset(asset, options)
        fullFiles.set(request.url, pending)
      }
      const bytes = await pending
      request.signal.throwIfAborted()
      if (bytes) return assetResponse(bytes, request)
      fullFiles.delete(request.url) // A background prefetch may finish after this cache miss.
    }
    // Cache Storage cannot store 206 responses and does not distinguish Range headers.
    // Store a 200 envelope under a range-specific key, then restore the original response.
    const key = new URL(url)
    key.searchParams.set('__codedang_range', request.headers.get('range') ?? 'full')
    if (asset) key.searchParams.set('__sha256', asset.sha256)
    let cache: Cache
    try { cache = await caches.open(cacheName) }
    catch { return network(input, init) }
    try {
      const stored = await cache.match(key.href)
      if (stored) {
        const status = Number(stored.headers.get('x-codedang-status'))
        const originalUrl = stored.headers.get('x-codedang-url')
        const headers = new Headers(stored.headers)
        headers.delete('x-codedang-status')
        headers.delete('x-codedang-url')
        if ((status === 200 || status === 206) && originalUrl && (status !== 206 || headers.has('content-range'))) {
          request.signal.throwIfAborted()
          const response = new Response(stored.body, { status, headers })
          Object.defineProperty(response, 'url', { value: originalUrl })
          return response
        }
        await cache.delete(key.href)
      }
    } catch { request.signal.throwIfAborted() }
    const response = await network(input, init)
    if (response.status !== 200 && response.status !== 206) return response
    if (response.type === 'opaque' || /no-store|private/i.test(response.headers.get('cache-control') ?? '') ||
        response.headers.get('vary') === '*' || !response.body) return response
    const limit = options.maxAssetBytes ?? 128 * 1024 * 1024
    const declared = Number(response.headers.get('content-length'))
    if (declared > limit || (response.status === 206 && !response.headers.has('content-range'))) return response
    // Complete the write before returning: the compiler Worker can be terminated immediately afterwards.
    const reader = response.clone().body!.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        request.signal.throwIfAborted()
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > limit) { void reader.cancel().catch(() => {}); return response }
        chunks.push(value)
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      const headers = new Headers(response.headers)
      headers.set('x-codedang-status', String(response.status))
      headers.set('x-codedang-url', response.url || request.url)
      // Fetch has already decoded the body.
      headers.delete('content-encoding')
      headers.set('content-length', String(size))
      request.signal.throwIfAborted()
      await cache.put(key.href, new Response(bytes, { headers }))
    } catch {
      void reader.cancel().catch(() => {})
      request.signal.throwIfAborted()
    } finally { reader.releaseLock() }
    return response
  }
}

async function readFullAsset(asset: ToolchainAsset, options: LoaderOptions): Promise<Uint8Array | undefined> {
  if (asset.size > (options.maxAssetBytes ?? 128 * 1024 * 1024)) return
  const key = new URL(asset.url)
  key.searchParams.set('__sha256', asset.sha256)
  try {
    const cache = await caches.open('codedang-toolchains-v1')
    const stored = await cache.match(key.href)
    if (!stored) return
    const bytes = new Uint8Array(await stored.arrayBuffer())
    const hash = await crypto.subtle.digest('SHA-256', bytes)
    const actual = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
    if (bytes.length !== asset.size || actual !== asset.sha256) {
      await cache.delete(key.href)
      return
    }
    return bytes
  } catch { /* Optional storage: use the existing range cache or network instead. */ }
}

function assetResponse(bytes: Uint8Array, request: Request): Response {
  let status = 200
  let body = bytes
  const headers = new Headers({ 'accept-ranges': 'bytes' })
  const range = request.headers.get('range')
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    const start = match?.[1] ? Number(match[1]) : Math.max(0, bytes.length - Number(match?.[2]))
    const end = match?.[1] && match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1
    if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) || start > end || start >= bytes.length) {
      const response = new Response(null, { status: 416, headers: { 'content-range': `bytes */${bytes.length}` } })
      Object.defineProperty(response, 'url', { value: request.url })
      return response
    }
    status = 206
    body = bytes.subarray(start, end + 1)
    headers.set('content-range', `bytes ${start}-${end}/${bytes.length}`)
  }
  headers.set('content-length', String(body.length))
  if (request.url.endsWith('.wasm')) headers.set('content-type', 'application/wasm')
  else if (request.url.endsWith('.js')) headers.set('content-type', 'application/javascript')
  else headers.set('content-type', 'application/octet-stream')
  const response = new Response(body as Uint8Array<ArrayBuffer>, { status, headers })
  Object.defineProperty(response, 'url', { value: request.url })
  return response
}
