import workerUrl from './worker?worker&url'
import type { Backend, ExecutionResult } from '../../core/types'

export type JavaProgram =
  | { action: 'compile'; source: string; fs: ExecutionResult['fs'] }
  | { action: 'run'; binary: Uint8Array; runtime: Uint8Array }

export function createTeaVMBackend(): Backend {
  return {
    start(payload, output, signal) {
      signal.throwIfAborted()
      if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
        throw new Error('Java requires cross-origin isolation (COOP/COEP headers)')
      }
      const program = payload as JavaProgram
      if (!program || (program.action === 'compile'
        ? typeof program.source !== 'string' || !program.fs
        : program.action !== 'run' || !(program.binary instanceof Uint8Array) || !(program.runtime instanceof Uint8Array))) {
        throw new Error('Invalid Java program')
      }
      const worker = new Worker(workerUrl, { type: 'module' })
      const input = new SharedArrayBuffer(8196)
      const state = new Int32Array(input, 0, 1)
      let ended = false
      let inputEnded = false
      let rejectResult: (error: unknown) => void
      const cleanup = () => {
        if (ended) return
        ended = true
        signal.removeEventListener('abort', abort)
        worker.terminate()
      }
      const abort = () => { rejectResult(signal.reason); cleanup() }
      const result = new Promise<ExecutionResult>((resolve, reject) => {
        rejectResult = reject
        worker.onmessage = ({ data }) => {
          if (data.type === 'stdout' || data.type === 'stderr') output[data.type as 'stdout' | 'stderr'](data.data)
          else if (data.type === 'error') { reject(new Error(data.error)); cleanup() }
          else if (data.type === 'result') { resolve(data.result); cleanup() }
        }
        worker.onerror = event => { reject(new Error(event.message)); cleanup() }
        worker.onmessageerror = () => { reject(new Error('Invalid Java worker message')); cleanup() }
      })
      signal.addEventListener('abort', abort, { once: true })
      try { worker.postMessage({ program, input }) }
      catch (error) { rejectResult!(error); cleanup() }
      async function waitForInput() {
        while (Atomics.load(state, 0) !== 0) {
          signal.throwIfAborted()
          if (ended) throw new Error('Java program has ended')
          await new Promise(resolve => setTimeout(resolve, 4))
        }
        signal.throwIfAborted()
        if (ended) throw new Error('Java program has ended')
      }
      return {
        result,
        stdinChunkBytes: 8192,
        async write(text) {
          if (inputEnded) throw new Error('Java stdin is closed')
          await waitForInput()
          const bytes = new TextEncoder().encode(text)
          if (bytes.length > 8192) throw new Error('Java input chunk is too large')
          new Uint8Array(input, 4).set(bytes)
          Atomics.store(state, 0, bytes.length)
          Atomics.notify(state, 0)
        },
        async eof() {
          // Compilers do not read stdin.
          if (program.action === 'compile' || ended || inputEnded) return
          inputEnded = true
          await waitForInput()
          Atomics.store(state, 0, -1)
          Atomics.notify(state, 0)
        }
      }
    }
  }
}
