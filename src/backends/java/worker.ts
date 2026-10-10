import type { JavaProgram } from './teavm'
import { javaBootstrap } from '../../languages/java/bootstrap'
import { annotationSdkOverlay } from '../../languages/java/sdk-overlay'
import { redirectJavaStdin } from '../../languages/java/redirect-stdin'

const send = (type: string, data: string) => self.postMessage({ type, data })

self.onmessage = ({ data }: MessageEvent<{ program: JavaProgram; input: SharedArrayBuffer }>) => {
  void run(data).catch(error => {
    console.error(error)
    self.postMessage({ type: 'error', error: String(error) })
  })
}

async function run({ program, input }: { program: JavaProgram; input: SharedArrayBuffer }) {
  // Import the hash-verified upstream loader verbatim; no runtime patching.
  const runtimeBytes = program.action === 'compile' ? program.fs['/compiler.wasm-runtime.js'] : undefined
  const runtime = program.action === 'run' ? program.runtime
    : runtimeBytes?.mode === 'binary' ? runtimeBytes.content : undefined
  if (!runtime) throw new Error('Missing TeaVM runtime loader')
  const runtimeUrl = URL.createObjectURL(new Blob([runtime as Uint8Array<ArrayBuffer>], { type: 'text/javascript' }))
  let load
  try { ({ load } = await import(/* @vite-ignore */ runtimeUrl)) }
  finally { URL.revokeObjectURL(runtimeUrl) }
  if (program.action === 'compile') {
    const binary = (path: string) => {
      const file = program.fs[path]
      if (!file || file.mode !== 'binary') throw new Error(`Missing Java asset: ${path}`)
      return new Int8Array(file.content)
    }
    const runtime = await load(binary('/compiler.wasm'))
    const compiler = runtime.exports.createCompiler()
    compiler.setSdk(binary('/compile-classlib-teavm.bin'))
    compiler.setSdk(Int8Array.from(atob(annotationSdkOverlay), char => char.charCodeAt(0)))
    compiler.setSdk(binary('/scanner-sdk.bin'))
    compiler.setTeaVMClasslib(binary('/runtime-classlib-teavm.bin'))
    compiler.setTeaVMClasslib(binary('/runtime-compat.bin'))
    compiler.setTeaVMClasslib(binary('/scanner-runtime.bin'))
    compiler.onDiagnostic((diagnostic: { fileName: string; lineNumber: number; message: string }) => {
      send('stderr', `${diagnostic.fileName ?? 'TeaVM'}:${diagnostic.lineNumber}: ${diagnostic.message}\n`)
    })
    compiler.addSourceFile('Main.java', program.source)
    compiler.addSourceFile('CodedangBootstrap.java', javaBootstrap)
    const compiled = compiler.compile()
    if (compiled) {
      for (const path of compiler.listOutputFiles()) {
        if (path.endsWith('.class')) compiler.addOutputClassFile(path,
          new Int8Array(redirectJavaStdin(new Uint8Array(compiler.getOutputFile(path)))))
      }
    }
    if (!compiled || !compiler.generateWebAssembly({ outputName: 'app', mainClass: 'CodedangBootstrap' })) {
      self.postMessage({ type: 'result', result: { exitCode: 1, fs: {} } })
      return
    }
    const bytes = new Uint8Array(compiler.getWebAssemblyOutputFile('app.wasm'))
    const date = new Date(0)
    self.postMessage({ type: 'result', result: { exitCode: 0, fs: {
      '/program.wasm': { path: '/program.wasm', mode: 'binary', content: bytes,
        timestamps: { access: date, modification: date, change: date } }
    } } })
    return
  }
  const state = new Int32Array(input, 0, 1)
  const bytes = new Uint8Array(input, 4)
  let offset = 0
  const pending = { stdout: '', stderr: '' }
  const flush = () => {
    for (const type of ['stdout', 'stderr'] as const) {
      if (pending[type]) { send(type, pending[type]); pending[type] = '' }
    }
  }
  Object.assign(globalThis, {
    codedangRead() {
      flush() // Prompts without a newline must be visible before blocking.
      let size: number
      while ((size = Atomics.load(state, 0)) === 0) Atomics.wait(state, 0, 0)
      if (size === -1) return -1
      const value = bytes[offset++]
      if (offset === size) { offset = 0; Atomics.store(state, 0, 0); Atomics.notify(state, 0) }
      return value
    },
    codedangAvailable() { return Math.max(0, Atomics.load(state, 0) - offset) }
  })
  const character = (type: 'stdout' | 'stderr', value: number) => {
    pending[type] += String.fromCharCode(value)
    if (value === 10 || pending[type].length >= 1024 && !(value >= 0xd800 && value <= 0xdbff)) flush()
  }
  const application = await load(program.binary, { installImports(imports: Record<string, unknown>) {
    imports.teavmConsole = {
      putcharStdout: (value: number) => character('stdout', value),
      putcharStderr: (value: number) => character('stderr', value)
    }
  } })
  try { await application.exports.main([]) }
  finally { flush() }
  self.postMessage({ type: 'result', result: { exitCode: 0, fs: {} } })
}
