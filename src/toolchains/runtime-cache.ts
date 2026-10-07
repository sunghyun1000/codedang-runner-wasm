import type { LoaderOptions } from './loader'

const cacheName = 'codedang-cheerpj-runtime-v1'

/** Cache CheerpJ fetches, including partial responses, across disposable Workers. */
export function createRuntimeFetch(loaderUrl: string, options: LoaderOptions = {}, network = globalThis.fetch.bind(globalThis)): typeof fetch {
  const root = new URL('.', loaderUrl)
  return async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (options.cache === false || request.method !== 'GET' || request.headers.has('authorization') ||
        request.credentials === 'include' || url.origin !== root.origin || !url.pathname.startsWith(root.pathname) ||
        request.cache === 'no-store' || request.cache === 'reload' || typeof caches === 'undefined') {
      return network(input, init)
    }
    request.signal.throwIfAborted()
    // Cache Storage cannot store 206 responses and does not distinguish Range headers.
    // Store a 200 envelope under a range-specific key, then restore the original response.
    const key = new URL(url)
    key.searchParams.set('__codedang_range', request.headers.get('range') ?? 'full')
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
