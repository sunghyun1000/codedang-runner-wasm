import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

export function verifyArtifact(bytes, asset) {
  if (bytes.length !== asset.size) throw new Error(`Size mismatch: ${asset.url}`)
  if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`SHA-256 mismatch: ${asset.url}`)
}

export async function downloadArtifact(url, destination, asset) {
  try {
    verifyArtifact(await readFile(destination), asset)
    return
  } catch { /* Missing or corrupt local cache is replaced only with verified bytes. */ }
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`)
  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > asset.size) throw new Error(`Size mismatch: ${url}`)
    chunks.push(chunk)
  }
  const bytes = Buffer.concat(chunks)
  verifyArtifact(bytes, asset)
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, bytes)
}

export async function prepareJavaToolchain() {
  const manifest = JSON.parse(await readFile(join(root, 'src/languages/java/toolchain.json'), 'utf8'))
  const distribution = JSON.parse(await readFile(join(root, 'src/languages/java/distribution.json'), 'utf8'))
  const asset = manifest.assets[0]
  const directory = join(root, '.toolchains/java', dirname(asset.url))
  await downloadArtifact(distribution.compiler, join(root, '.toolchains/java', asset.url), asset)
  await downloadArtifact(distribution.sources.url, join(directory, 'ecj-sources.jar'), distribution.sources)
  for (const name of ['LICENSE', 'NOTICE']) await copyFile(join(root, 'src/languages/java', name), join(directory, name))
  console.log(`Prepared verified ECJ ${manifest.version} and corresponding sources in .toolchains/java/`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareJavaToolchain()
