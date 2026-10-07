import type { LanguageAdapter } from '../../core/types'
import { wasiProgram } from '../../backends/wasi/types'
import { python311 } from '../toolchains'
import { requireBinary, withSource } from '../files'

const SOURCE = '/solution.py'

export const pythonAdapter: LanguageAdapter = {
  kind: 'interpreted',
  toolchain: python311,

  async prepare(source, { fs, signal }) {
    signal.throwIfAborted()
    return wasiProgram({
      binary: requireBinary(fs, '/python-3.11.3.wasm'),
      args: ['python', SOURCE],
      fs: withSource(fs, SOURCE, source),
      env: { PYTHONIOENCODING: 'utf-8' }
    })
  }
}
