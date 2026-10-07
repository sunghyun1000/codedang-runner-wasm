import type { FileSystem } from '../core/types'

export function withSource(fs: FileSystem, path: string, source: string): FileSystem {
  const now = new Date()
  return {
    ...fs,
    [path]: {
      path, mode: 'string', content: source,
      timestamps: { access: now, modification: now, change: now }
    }
  }
}

export function requireBinary(fs: FileSystem, path: string): Uint8Array {
  const file = fs[path]
  if (!file || file.mode !== 'binary') throw new Error(`Toolchain binary missing: ${path}`)
  return file.content
}
