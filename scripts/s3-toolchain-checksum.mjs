import { createHash } from 'node:crypto'

export function artifactChecksum(bytes) {
  return createHash('sha256').update(bytes).digest('base64')
}

export function verifyExistingArtifact(existing, bytes, key) {
  if (existing.ContentLength !== bytes.length || existing.ChecksumSHA256 !== artifactChecksum(bytes)) {
    throw new Error(`Existing S3 object does not match pinned bytes: ${key}`)
  }
}
