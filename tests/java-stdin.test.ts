import { describe, expect, it } from 'vitest'
import { redirectJavaStdin } from '../src/languages/java/redirect-stdin'
import { javaAdapter } from '../src/languages/java'

function fixture(owner = 'java/lang/System', field = 'in') {
  const text = (value: string) => [1, 0, value.length, ...new TextEncoder().encode(value)]
  return Uint8Array.from([
    0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 52, 0, 7,
    ...text(owner), // #1 UTF8
    7, 0, 1, // #2 Class
    ...text(field), // #3 UTF8
    ...text('Ljava/io/InputStream;'), // #4 UTF8
    12, 0, 3, 0, 4, // #5 NameAndType
    9, 0, 2, 0, 5, // #6 Fieldref
    0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
  ])
}

describe('Java stdin bytecode adapter', () => {
  it('redirects resolved System.in owners without changing other constants', () => {
    const input = fixture()
    const result = redirectJavaStdin(input)
    expect(new DataView(result.buffer).getUint16(8)).toBe(9)
    expect(new TextDecoder().decode(result)).toContain('CodedangBootstrap')
    expect(redirectJavaStdin(result)).toBe(result)
    expect(new DataView(input.buffer).getUint16(8)).toBe(7)
  })
  it('does not touch System.out or a user-defined System class', () => {
    for (const bytes of [fixture('java/lang/System', 'out'), fixture('System')]) {
      expect(redirectJavaStdin(bytes)).toBe(bytes)
    }
  })
  it('rejects non-class input', () => {
    expect(() => redirectJavaStdin(new Uint8Array(10))).toThrow('Invalid Java class')
  })
  it('uses the Java backend for compilation and execution', async () => {
    const fs = { '/compiler.wasm-runtime.js': {
      path: '/compiler.wasm-runtime.js', mode: 'binary' as const, content: new Uint8Array([1]),
      timestamps: { access: new Date(0), modification: new Date(0), change: new Date(0) }
    } }
    const binary = { ...fs['/compiler.wasm-runtime.js'], path: '/program.wasm' }
    const program = await javaAdapter.prepare('source', {
      fs, signal: new AbortController().signal,
      execute: async request => {
        expect(request).toEqual({ backend: 'java', payload: { action: 'compile', source: 'source', fs } })
        return { exitCode: 0, fs: { '/program.wasm': binary }, stdout: '', stderr: '' }
      }
    })
    expect(program).toEqual({ backend: 'java', payload: { action: 'run', binary: binary.content, runtime: binary.content } })
  })
})
