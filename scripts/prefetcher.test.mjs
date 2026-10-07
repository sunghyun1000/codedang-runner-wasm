import { afterEach, test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { importTestModule } from './import-test-module.mjs'

const { ToolchainPrefetcher } = await importTestModule('../src/toolchains/prefetcher.ts')
const { ToolchainLoader } = await importTestModule('../src/toolchains/loader.ts')
const originalCaches = globalThis.caches
const originalFetch = globalThis.fetch
afterEach(() => {
  mock.restoreAll()
  globalThis.fetch = originalFetch
  if (originalCaches === undefined) delete globalThis.caches
  else globalThis.caches = originalCaches
})

const asset = { path: '/hello', url: 'https://assets.example/hello', size: 5,
  sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824' }
const manifest = { id: 'test', version: '1', assets: [asset] }
const signal = () => new AbortController().signal

function storage() {
  const entries = new Map()
  globalThis.caches = { open: async () => ({
    match: async key => entries.get(key)?.clone(),
    put: async (key, response) => { entries.set(key, response.clone()) },
    delete: async key => entries.delete(key)
  }) }
  return entries
}

test('prefetch stores original archives without extracting, reuses valid hashes and repairs corrupt bytes', async () => {
  const entries = storage()
  let downloads = 0
  globalThis.fetch = async () => { downloads++; return new Response('hello') }
  const loader = new ToolchainLoader()
  const archive = { ...manifest, assets: [{ ...asset, archive: 'tar.gz' }] }
  await loader.prefetch(archive, signal()) // Fixture is deliberately not a valid archive.
  await loader.prefetch(archive, signal())
  assert.equal(downloads, 1)
  const key = [...entries.keys()][0]
  entries.set(key, new Response('wrong'))
  await loader.prefetch(archive, signal())
  assert.equal(downloads, 2)
  assert.equal(await entries.get(key).clone().text(), 'hello')
})

test('changed manifest hash downloads new bytes rather than reusing the old version', async () => {
  storage()
  let downloads = 0
  globalThis.fetch = async () => { downloads++; return new Response(downloads === 1 ? 'hello' : 'world') }
  const loader = new ToolchainLoader()
  await loader.prefetch(manifest, signal())
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('world'))
  const sha256 = Buffer.from(hash).toString('hex')
  await loader.prefetch({ ...manifest, assets: [{ ...asset, sha256 }] }, signal())
  assert.equal(downloads, 2)
})

test('prefetch reports unavailable storage and quota errors instead of claiming persistence', async () => {
  delete globalThis.caches
  await assert.rejects(new ToolchainLoader().prefetch(manifest, signal()), /Cache Storage/)
  globalThis.fetch = async () => new Response('hello')
  globalThis.caches = { open: async () => ({ match: async () => undefined, put: async () => { throw new Error('quota') } }) }
  await assert.rejects(new ToolchainLoader().prefetch(manifest, signal()), /quota/)
})

test('downloads selected, available, then remaining languages and continues after errors', async () => {
  storage()
  const urls = []
  // Deliberately fail downloads: verify ordering and failure isolation without downloading large binaries.
  globalThis.fetch = async url => { urls.push(String(url)); return new Response(null, { status: 503 }) }
  const result = await new ToolchainPrefetcher({ assetBaseUrl: 'https://assets.example/' }).prefetch({
    selectedLanguage: 'Python3', availableLanguages: ['Java']
  })
  assert.match(urls[0], /python/)
  assert.match(urls[1], /ecj/)
  assert.match(urls[2], /loader\.js/)
  assert.match(urls[3], /clang/)
  assert.deepEqual(Object.keys(result.errors), ['Python3', 'Java', 'C', 'Cpp'])
})

test('prepares all languages but only downloads a shared manifest once per queue', async () => {
  const statuses = []
  const prefetcher = new ToolchainPrefetcher({ onStatus: status => statuses.push(status) })
  const manifests = []
  mock.method(prefetcher.loader, 'prefetch', async manifest => { manifests.push(manifest) })
  const result = await prefetcher.prefetch({ selectedLanguage: 'Cpp', availableLanguages: ['Java'] })
  assert.deepEqual(result.completed, ['Cpp', 'Java', 'C', 'Python3'])
  assert.deepEqual(manifests.map(manifest => manifest.id), ['runno-clang', 'eclipse-ecj', 'cheerpj-java17', 'runno-python'])
  assert.equal(manifests[2].assets.find(asset => asset.path === '/17/lib/modules').size, 38145733)
  assert.deepEqual(statuses.filter(status => status.state === 'ready').map(status => status.language), result.completed)
})

test('updates the pending priority while retaining the current download; disposal aborts', async () => {
  storage()
  let release
  const urls = []
  globalThis.fetch = async url => {
    urls.push(String(url))
    if (urls.length === 1) await new Promise(resolve => { release = resolve })
    return new Response(null, { status: 503 })
  }
  const prefetcher = new ToolchainPrefetcher({ assetBaseUrl: 'https://assets.example/' })
  const first = prefetcher.prefetch({ selectedLanguage: 'C', availableLanguages: [] })
  while (!release) await new Promise(resolve => setImmediate(resolve))
  assert.equal(first, prefetcher.prefetch({ selectedLanguage: 'Java', availableLanguages: [] }))
  release()
  await first
  assert.match(urls[1], /ecj/)
  prefetcher.dispose()
  assert.throws(() => prefetcher.prefetch({ selectedLanguage: 'C', availableLanguages: [] }), /abort/i)
})
