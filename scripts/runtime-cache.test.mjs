import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { importTestModule } from './import-test-module.mjs'

const { createRuntimeFetch } = await importTestModule('../src/toolchains/runtime-cache.ts')

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
  key.searchParams.set('__sha256', 'f121f2dd8164921c36ece441d0ad17043ad3067a698a35ff0b58328cabe93ff7')
  entries.set(key.href, new Response('bad', { headers: { 'x-codedang-status': '206', 'x-codedang-url': url } }))
  let calls = 0
  const response = await createRuntimeFetch(loader, {}, async () => { calls++; return partial() })(url, {
    headers: { Range: 'bytes=0-3' }
  })
  assert.equal(await response.text(), 'abcd')
  assert.equal(calls, 1)
})

test('serves arbitrary ranges from a hash-verified whole runtime file without network requests', async () => {
  const entries = storage()
  const file = 'https://runtime.example/4.3/etc/users'
  const key = new URL(file)
  key.searchParams.set('__sha256', 'ba22ff21f2d73daf148452051c728541389dc0f91420b4f3bb371bd025362810')
  entries.set(key.href, new Response('user:x:1000:1000:user:/files:/dev/null\n'))
  const fetch = createRuntimeFetch(loader, {}, async () => { throw new Error('unexpected network request') })
  const response = await fetch(file, { headers: { Range: 'bytes=0-3' } })
  assert.equal(response.status, 206)
  assert.equal(response.url, file)
  assert.equal(response.headers.get('content-range'), 'bytes 0-3/39')
  assert.equal(await response.text(), 'user')
  assert.equal(await (await fetch(file, { headers: { Range: 'bytes=-5' } })).text(), 'null\n')
  assert.equal(await (await fetch(file, { headers: { Range: 'bytes=34-' } })).text(), 'null\n')
  assert.equal((await fetch(file, { headers: { Range: 'bytes=39-40' } })).status, 416)
  assert.equal((await fetch(file, { headers: { Range: 'bytes=0-1,3-4' } })).status, 416)
  assert.equal(await (await fetch(file)).text(), 'user:x:1000:1000:user:/files:/dev/null\n')
})

test('rejects a corrupt whole runtime asset and falls back to the network', async () => {
  const entries = storage()
  const file = 'https://runtime.example/4.3/etc/users'
  const key = new URL(file)
  key.searchParams.set('__sha256', 'ba22ff21f2d73daf148452051c728541389dc0f91420b4f3bb371bd025362810')
  entries.set(key.href, new Response('corrupt'))
  let calls = 0
  await createRuntimeFetch(loader, {}, async () => { calls++; return new Response('fallback') })(file)
  assert.equal(calls, 1)
  assert.equal(entries.has(key.href), false)
})
