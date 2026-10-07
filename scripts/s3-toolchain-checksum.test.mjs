import assert from 'node:assert/strict'
import { test } from 'node:test'
import { artifactChecksum, verifyExistingArtifact } from './s3-toolchain-checksum.mjs'

test('S3 artifact validation accepts only matching size and SHA-256', () => {
  const bytes = Buffer.from('hello')
  const existing = { ContentLength: 5, ChecksumSHA256: artifactChecksum(bytes) }
  assert.doesNotThrow(() => verifyExistingArtifact(existing, bytes, 'ecj.jar'))
  for (const invalid of [
    { ...existing, ContentLength: 6 },
    { ...existing, ChecksumSHA256: artifactChecksum(Buffer.from('wrong')) },
    { ContentLength: 5 }
  ]) assert.throws(() => verifyExistingArtifact(invalid, bytes, 'ecj.jar'), /does not match pinned bytes/)
})
