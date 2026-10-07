import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

/** Verify before copying: a package upgrade must not silently change toolchains. */
export async function copyVerifiedAsset(source, destination, asset) {
  const bytes = await readFile(source)
  if (bytes.length !== asset.size) throw new Error(`Size mismatch: ${asset.url}`)
  if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
    throw new Error(`SHA-256 mismatch: ${asset.url}`)
  }
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, bytes)
}

export async function prepareRunnoToolchains() {
  // Resolve the public entry rather than a node_modules path; this also works with pnpm.
  const packageDirectory = dirname(dirname(fileURLToPath(import.meta.resolve('@runno/sandbox'))))
  const installed = JSON.parse(await readFile(join(packageDirectory, 'package.json'), 'utf8'))
  const project = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const version = project.devDependencies['@runno/sandbox']
  if (installed.version !== version) throw new Error(`Expected @runno/sandbox@${version}, found ${installed.version}`)

  const manifests = JSON.parse(await readFile(join(root, 'src/languages/toolchains.json'), 'utf8'))
  const output = join(root, '.toolchains/runno')
  const assets = Object.values(manifests).flatMap(manifest => manifest.assets)
  for (const asset of assets) {
    if (basename(asset.url) !== asset.url) throw new Error(`Invalid toolchain filename: ${asset.url}`)
    await copyVerifiedAsset(join(packageDirectory, 'dist/langs', asset.url), join(output, asset.url), asset)
  }
  await copyFile(join(packageDirectory, 'LICENSE'), join(output, 'RUNNO-LICENSE'))
  console.log(`Prepared ${assets.length} verified assets from @runno/sandbox@${version} in .toolchains/runno/`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareRunnoToolchains()
}
