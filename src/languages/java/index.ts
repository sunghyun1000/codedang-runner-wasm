import type { LanguageAdapter } from '../../core/types'
import { CompileError } from '../../core/errors'
import { requireBinary } from '../files'
import manifest from './toolchain.json'

export const javaAdapter: LanguageAdapter = {
  kind: 'compiled',
  toolchain: manifest,
  async prepare(source, { fs, execute }) {
    const result = await execute({ backend: 'java', payload: { action: 'compile', source, fs } })
    if (!result.fs['/program.wasm']) throw new CompileError('Java compiler did not produce WebAssembly')
    return { backend: 'java', payload: { action: 'run', binary: requireBinary(result.fs, '/program.wasm'),
      runtime: requireBinary(fs, '/compiler.wasm-runtime.js') } }
  }
}
