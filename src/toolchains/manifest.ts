export interface ToolchainAsset {
  path: string
  url: string
  sha256: string
  /** Exact decoded response size in bytes. */
  size: number
}

export interface ToolchainManifest {
  id: string
  version: string
  assets: readonly ToolchainAsset[]
}

export function validateManifest(manifest: ToolchainManifest): void {
  if (!manifest.id || !manifest.version) throw new Error('Missing toolchain version')
  const paths = new Set<string>()
  for (const asset of manifest.assets) {
    if (
      !asset.path.startsWith('/') ||
      asset.path.split('/').some(part => part === '.' || part === '..') ||
      paths.has(asset.path) ||
      !asset.url ||
      !/^[a-f\d]{64}$/i.test(asset.sha256) ||
      !Number.isSafeInteger(asset.size) ||
      asset.size < 0
    ) throw new Error(`Invalid toolchain asset: ${asset.path}`)
    paths.add(asset.path)
  }
}
