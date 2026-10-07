import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareJavaToolchain } from './prepare-java-toolchain.mjs'
import { artifactChecksum, verifyExistingArtifact } from './s3-toolchain-checksum.mjs'

const bucket = process.env.TOOLCHAIN_BUCKET
if (!bucket) throw new Error('Set TOOLCHAIN_BUCKET to the target S3 bucket')
const prefix = (process.env.TOOLCHAIN_PREFIX ?? 'toolchains').replace(/^\/+|\/+$/g, '')
const root = new URL('..', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('src/languages/java/toolchain.json', root), 'utf8'))
await prepareJavaToolchain()
const asset = manifest.assets[0]
const files = [asset.url, ...['ecj-sources.jar', 'LICENSE', 'NOTICE'].map(name => `${dirname(asset.url)}/${name}`)]

for (const file of files) {
  const bytes = await readFile(new URL(`.toolchains/java/${file}`, root))
  const checksum = artifactChecksum(bytes)
  const key = prefix ? `${prefix}/${file}` : file
  let existing
  try {
    existing = JSON.parse(execFileSync('aws', ['s3api', 'head-object', '--bucket', bucket, '--key', key,
      '--checksum-mode', 'ENABLED'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  } catch (error) {
    // AccessDenied/network failures must not be mistaken for a missing object.
    if (!/\(404\)|\(NoSuchKey\)|\(NotFound\)/.test(error.stderr?.toString() ?? '')) throw error
  }
  if (existing) {
    verifyExistingArtifact(existing, bytes, key)
    console.log(`Verified existing s3://${bucket}/${key}`)
    continue
  }
  execFileSync('aws', ['s3api', 'put-object', '--bucket', bucket, '--key', key,
    '--body', fileURLToPath(new URL(`.toolchains/java/${file}`, root)),
    '--if-none-match', '*', '--checksum-algorithm', 'SHA256', '--checksum-sha256', checksum,
    '--content-type', file.endsWith('.jar') ? 'application/java-archive' : 'text/plain; charset=utf-8',
    '--cache-control', 'public,max-age=31536000,immutable'], { stdio: 'inherit' })
}
