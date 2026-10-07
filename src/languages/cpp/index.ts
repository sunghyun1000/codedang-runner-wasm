import type { LanguageAdapter } from '../../core/types'
import { wasiProgram } from '../../backends/wasi/types'
import { runnoClang8 } from '../toolchains'
import { requireBinary, withSource } from '../files'

const SOURCE = '/main.cpp'
const OBJECT = '/program.o'
const OUTPUT = '/program.wasm'

export const cppAdapter: LanguageAdapter = {
  kind: 'compiled',
  toolchain: runnoClang8,

  async prepare(source, { fs, execute, signal }) {
    signal.throwIfAborted()
    const files = withSource(fs, SOURCE, source)
    const clang = requireBinary(files, '/clang.wasm')
    const compiled = await execute(wasiProgram({
      binary: clang,
      args: [
        'clang', '-cc1', '-Werror', '-emit-obj', '-disable-free',
        '-isysroot', '/sys', '-internal-isystem', '/sys/include/c++/v1',
        '-internal-isystem', '/sys/include',
        '-internal-isystem', '/sys/lib/clang/8.0.1/include',
        '-ferror-limit', '4', '-fmessage-length', '80',
        '-fcolor-diagnostics', '-O2', '-std=c++14', '-o', OBJECT,
        '-x', 'c++', SOURCE
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
        '/sys/lib/wasm32-wasi/crt1.o', OBJECT,
        '-lc', '-lc++', '-lc++abi', '-lm', '-o', OUTPUT
      ],
      fs: compiled.fs
    }))
    return wasiProgram({ binary: requireBinary(linked.fs, OUTPUT), fs: {} })
  }
}
