import type { LanguageAdapter } from '../../core/types'
import { wasiProgram } from '../../backends/wasi/types'
import { requireBinary, withSource } from '../files'
import { runnoClang8 } from '../toolchains'

const C_SOURCE = '/main.c'
const OBJECT = '/program.o'
const OUTPUT = '/program.wasm'

export const cAdapter: LanguageAdapter = {
  kind: 'compiled',
  toolchain: runnoClang8,

  async prepare(source, { fs, execute, signal }) {
    signal.throwIfAborted()
    const files = withSource(fs, C_SOURCE, source)
    const clang = requireBinary(files, '/clang.wasm')

    const compiled = await execute(wasiProgram({
      binary: clang,
      args: [
        'clang', '-cc1', '-Werror', '-triple', 'wasm32-unknown-wasi',
        '-isysroot', '/sys', '-internal-isystem', '/sys/include',
        '-internal-isystem', '/sys/lib/clang/8.0.1/include',
        '-ferror-limit', '4', '-fmessage-length', '80',
        '-fcolor-diagnostics', '-O2', '-std=c11', '-emit-obj',
        '-o', OBJECT, C_SOURCE
      ],
      fs: files
    }))
    signal.throwIfAborted()

    const linker = requireBinary(compiled.fs, '/wasm-ld.wasm')
    const linked = await execute(wasiProgram({
      binary: linker,
      args: [
        'wasm-ld', '--no-threads', '--export-dynamic', '-z',
        'stack-size=1048576', '-L/sys/lib/wasm32-wasi',
        '/sys/lib/wasm32-wasi/crt1.o', OBJECT, '-lc', '-lm', '-o', OUTPUT
      ],
      fs: compiled.fs
    }))
    return wasiProgram({ binary: requireBinary(linked.fs, OUTPUT), fs: {} })
  }
}
