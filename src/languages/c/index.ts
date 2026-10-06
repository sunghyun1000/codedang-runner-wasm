import type { WASIFile, WASIFS } from '../../../runno/packages/wasi/lib/types'
import type { LanguageAdapter } from '../../session'
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

    const compiled = await execute({
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
    })
    signal.throwIfAborted()

    const linker = requireBinary(compiled.fs, '/wasm-ld.wasm')
    const linked = await execute({
      binary: linker,
      args: [
        'wasm-ld', '--no-threads', '--export-dynamic', '-z',
        'stack-size=1048576', '-L/sys/lib/wasm32-wasi',
        '/sys/lib/wasm32-wasi/crt1.o', OBJECT, '-lc', '-lm', '-o', OUTPUT
      ],
      fs: compiled.fs
    })
    return executable(linked.fs, OUTPUT)
  }
}

export function withSource(fs: WASIFS, path: string, source: string): WASIFS {
  const now = new Date()
  const file: WASIFile = {
    path, mode: 'string', content: source,
    timestamps: { access: now, modification: now, change: now }
  }
  return { ...fs, [path]: file }
}

export function requireBinary(fs: WASIFS, path: string): Uint8Array {
  const file = fs[path]
  if (!file || file.mode !== 'binary') throw new Error(`Toolchain binary missing: ${path}`)
  return file.content
}

export function executable(fs: WASIFS, path: string) {
  return { binary: requireBinary(fs, path), fs: {} }
}
