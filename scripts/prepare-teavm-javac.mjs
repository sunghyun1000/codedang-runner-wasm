import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('src/languages/java/toolchain.json', root), 'utf8'))
const directory = new URL('.toolchains/java/teavm-javac/', root)
await mkdir(directory, { recursive: true })
const valid = (bytes, asset) => bytes.length === asset.size && createHash('sha256').update(bytes).digest('hex') === asset.sha256
for (const asset of manifest.assets) {
  const name = asset.path.slice(1)
  const destination = new URL(name, directory)
  let existing
  try { existing = await readFile(destination) } catch { /* First download. */ }
  if (existing && valid(existing, asset)) continue
  throw new Error(`Missing or changed Java asset: ${name}. Run JAVA_HOME=/path/to/jdk-25 npm run build:java first.`)
}
console.log(`Prepared verified upstream TeaVM javac distribution in ${fileURLToPath(directory)}`)
