import type { FileSystem, Program } from '../../core/types'

export interface WasiProgram {
  binary: Uint8Array
  fs?: FileSystem
  args?: string[]
  env?: Record<string, string>
  isTTY?: boolean
}

/** Wrap WASI-specific data in the engine-independent execution request. */
export function wasiProgram(payload: WasiProgram): Program {
  return { backend: 'wasi', payload }
}
