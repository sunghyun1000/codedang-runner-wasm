import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { downloadArtifact } from './prepare-java-toolchain.mjs'

test('ECJ download verifies bytes, reuses cache and repairs corrupt cache', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'codedang-ecj-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const destination = join(directory, 'ecj.jar')
  const bytes = Buffer.from('compiler')
  const asset = { url: 'ecj.jar', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  let requests = 0
  const original = globalThis.fetch
  globalThis.fetch = async () => { requests++; return new Response(bytes) }
  t.after(() => { globalThis.fetch = original })
  await downloadArtifact('https://example.test/ecj.jar', destination, asset)
  await downloadArtifact('https://example.test/ecj.jar', destination, asset)
  assert.equal(requests, 1)
  await writeFile(destination, 'corrupt')
  await downloadArtifact('https://example.test/ecj.jar', destination, asset)
  assert.equal(requests, 2)
  assert.deepEqual(await readFile(destination), bytes)
})

test('ECJ download rejects wrong digest and oversized response without writing', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'codedang-ecj-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const destination = join(directory, 'ecj.jar')
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('wrong')
  t.after(() => { globalThis.fetch = original })
  await assert.rejects(downloadArtifact('https://example.test/ecj.jar', destination,
    { url: 'ecj.jar', size: 5, sha256: '0'.repeat(64) }), /SHA-256 mismatch/)
  await assert.rejects(downloadArtifact('https://example.test/ecj.jar', destination,
    { url: 'ecj.jar', size: 4, sha256: '0'.repeat(64) }), /Size mismatch/)
  await assert.rejects(readFile(destination), { code: 'ENOENT' })
})
