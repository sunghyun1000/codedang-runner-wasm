import type { LanguageAdapter } from '../../session'
import { python311 } from '../toolchains'
import { requireBinary, withSource } from '../c'

const SOURCE = '/solution.py'

export const pythonAdapter: LanguageAdapter = {
  kind: 'interpreted',
  toolchain: python311,

  async prepare(source, { fs, signal }) {
    signal.throwIfAborted()
    return {
      binary: requireBinary(fs, '/python-3.11.3.wasm'),
      args: ['python', SOURCE],
      fs: withSource(fs, SOURCE, source),
      env: { PYTHONIOENCODING: 'utf-8' }
    }
  }
}
