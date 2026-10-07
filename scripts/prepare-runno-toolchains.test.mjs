import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { copyVerifiedAsset } from './prepare-runno-toolchains.mjs'

for (const scenario of ['valid', 'size mismatch', 'hash mismatch']) {
  test(`asset copy: ${scenario}`, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'codedang-toolchain-test-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    const source = join(directory, 'source.wasm')
    const destination = join(directory, 'output/test.wasm')
    const bytes = Buffer.from([0, 97, 115, 109])
    await writeFile(source, bytes)
    const asset = {
      url: 'test.wasm', size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex')
    }
    if (scenario === 'size mismatch') asset.size++
    if (scenario === 'hash mismatch') asset.sha256 = '0'.repeat(64)
    if (scenario === 'valid') {
      await copyVerifiedAsset(source, destination, asset)
      assert.deepEqual(await readFile(destination), bytes)
    } else {
      await assert.rejects(copyVerifiedAsset(source, destination, asset), /mismatch/)
      await assert.rejects(readFile(destination), { code: 'ENOENT' })
    }
  })
}
