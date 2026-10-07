import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// Keep the Node test suite compatible with Node 22 releases without native TS support.
const source = await readFile(new URL('../src/toolchains/runtime-cache.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
const { createRuntimeFetch } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

const loader = 'https://runtime.example/4.3/loader.js'
const url = 'https://runtime.example/4.3/17/lib/modules'
const originalCaches = globalThis.caches
afterEach(() => {
  if (originalCaches === undefined) delete globalThis.caches
  else globalThis.caches = originalCaches
})

function storage() {
  const entries = new Map()
  globalThis.caches = { open: async () => ({
    match: async key => entries.get(key)?.clone(),
    put: async (key, response) => {
      assert.equal(response.status, 200, 'Cache Storage rejects 206')
      entries.set(key, new Response(await response.arrayBuffer(), { headers: response.headers }))
    },
    delete: async key => entries.delete(key)
  }) }
  return entries
}

function partial() {
  const response = new Response('abcd', { status: 206, headers: {
    'content-range': 'bytes 0-3/100', 'content-length': '4', 'cache-control': 'max-age=31536000'
  } })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

test('reuses partial responses across independent Worker fetch wrappers', async () => {
  storage()
  let calls = 0
  const network = async () => { calls++; return partial() }
  const first = createRuntimeFetch(loader, {}, network)
  const second = createRuntimeFetch(loader, {}, network)
  const init = { headers: { Range: 'bytes=0-3' } }
  assert.equal(await (await first(url, init)).text(), 'abcd')
  const response = await second(url, init)
  assert.equal(response.status, 206)
  assert.equal(response.url, url)
  assert.equal(response.headers.get('content-range'), 'bytes 0-3/100')
  assert.equal(response.headers.get('x-codedang-status'), null)
  assert.equal(await response.text(), 'abcd')
  assert.equal(calls, 1)
})

test('separates ranges, full responses and runtime versions', async () => {
  const entries = storage()
  let calls = 0
  const network = async () => { calls++; return partial() }
  const fetch = createRuntimeFetch(loader, {}, network)
  await fetch(url, { headers: { Range: 'bytes=0-3' } })
  await fetch(url, { headers: { Range: 'bytes=4-7' } })
  await fetch(url)
  await createRuntimeFetch(loader.replace('4.3', '4.4'), {}, network)(url.replace('4.3', '4.4'))
  assert.equal(calls, 4)
  assert.equal(entries.size, 4)
})

test('bypasses unrelated requests and authentication', async () => {
  const entries = storage()
  const fetch = createRuntimeFetch(loader, {}, async () => new Response('ok'))
  await fetch('https://other.example/4.3/17/lib/modules')
  await fetch('https://runtime.example/4.4/17/lib/modules')
  await fetch(url, { method: 'POST' })
  await fetch(url, { credentials: 'include' })
  await fetch(url, { headers: { Authorization: 'secret' } })
  assert.equal(entries.size, 0)
})

test('supports cache opt-out and unavailable storage', async () => {
  const entries = storage()
  await createRuntimeFetch(loader, { cache: false }, async () => partial())(url)
  assert.equal(entries.size, 0)
  delete globalThis.caches
  assert.equal((await createRuntimeFetch(loader, {}, async () => partial())(url)).status, 206)
})

test('storage failures do not prevent runtime execution', async () => {
  globalThis.caches = { open: async () => ({
    match: async () => { throw new Error('unavailable') },
    put: async () => { throw new Error('quota') }
  }) }
  const response = await createRuntimeFetch(loader, {}, async () => partial())(url)
  assert.equal(await response.text(), 'abcd')
})

test('does not persist errors, private responses or oversized assets', async () => {
  const entries = storage()
  for (const response of [new Response('failed', { status: 500 }),
    new Response('private', { headers: { 'cache-control': 'no-store' } }), partial()]) {
    await createRuntimeFetch(loader, { maxAssetBytes: 3 }, async () => response)(url)
  }
  assert.equal(entries.size, 0)
  await createRuntimeFetch(loader, { maxAssetBytes: 3 }, async () => new Response('too big'))(url)
  assert.equal(entries.size, 0)
})

test('rejects aborted requests without using the network', async () => {
  storage()
  const controller = new AbortController()
  controller.abort()
  let called = false
  await assert.rejects(createRuntimeFetch(loader, {}, async () => { called = true })(url, { signal: controller.signal }))
  assert.equal(called, false)
})

test('repairs invalid cached metadata instead of returning a broken partial response', async () => {
  const entries = storage()
  const key = new URL(url)
  key.searchParams.set('__codedang_range', 'bytes=0-3')
  entries.set(key.href, new Response('bad', { headers: { 'x-codedang-status': '206', 'x-codedang-url': url } }))
  let calls = 0
  const response = await createRuntimeFetch(loader, {}, async () => { calls++; return partial() })(url, {
    headers: { Range: 'bytes=0-3' }
  })
  assert.equal(await response.text(), 'abcd')
  assert.equal(calls, 1)
})
