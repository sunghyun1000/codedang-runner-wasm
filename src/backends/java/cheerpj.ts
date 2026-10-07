import workerUrl from './worker?worker&url'
import type { Backend, ExecutionResult } from '../../core/types'
import type { CheerpJOptions, JavaProgram, JavaWorkerResponse } from './types'
import { defaultCheerpJOptions } from '../../config'
export { defaultCheerpJOptions } from '../../config'

export function createCheerpJBackend(options: CheerpJOptions = {}): Backend {
  return {
    start(payload, output, signal) {
      signal.throwIfAborted()
      const program = payload as JavaProgram
      if (!program || (program.action !== 'compile' && program.action !== 'run') ||
          (program.action === 'compile' ? typeof program.source !== 'string' || !(program.compiler instanceof Uint8Array) : !(program.jar instanceof Uint8Array))) {
        throw new Error('Invalid Java program')
      }
      const loaderUrl = new URL(options.loaderUrl ?? defaultCheerpJOptions.loaderUrl, location.href).href
      // CheerpJ itself uses importScripts, so its global scope must be a
      // classic worker even when our backend is built as an ES module.
      const bootstrapUrl = URL.createObjectURL(new Blob([`
        const pending = [];
        self.onmessage = event => pending.push(event);
        try {
          importScripts(${JSON.stringify(loaderUrl)});
          import(${JSON.stringify(new URL(workerUrl, import.meta.url).href)}).then(() => {
            for (const event of pending) self.onmessage(event);
          }).catch(error => self.postMessage({ type: 'error', error: String(error) }));
        } catch (error) { self.postMessage({ type: 'error', error: String(error) }); }
      `], { type: 'application/javascript' }))
      let worker: Worker
      try { worker = new Worker(bootstrapUrl) }
      catch (error) { URL.revokeObjectURL(bootstrapUrl); throw error }
      let ended = false
      let inputEnded = false
      let nextInputId = 0
      const pendingInput = new Map<number, { resolve(): void; reject(error: unknown): void }>()
      let rejectResult: (error: unknown) => void
      const cleanup = () => {
        if (ended) return
        ended = true
        signal.removeEventListener('abort', abort)
        worker.terminate()
        URL.revokeObjectURL(bootstrapUrl)
        for (const input of pendingInput.values()) input.reject(new Error('Java program has ended'))
        pendingInput.clear()
      }
      const abort = () => { rejectResult(signal.reason ?? new Error('Execution cancelled')); cleanup() }
      const result = new Promise<ExecutionResult>((resolve, reject) => {
        rejectResult = reject
        worker.onmessage = (event: MessageEvent<JavaWorkerResponse>) => {
          if (ended) return
          const message = event.data
          if (message.type === 'input_consumed') {
            pendingInput.get(message.id)?.resolve()
            pendingInput.delete(message.id)
          } else if (message.type === 'stdout' || message.type === 'stderr') output[message.type](message.data)
          else if (message.type === 'error') { reject(new Error(message.error)); cleanup() }
          else if (message.type === 'result') {
            const now = new Date()
            resolve({ exitCode: message.exitCode, fs: message.jar ? {
              '/main.jar': { path: '/main.jar', mode: 'binary', content: message.jar,
                timestamps: { access: now, modification: now, change: now } }
            } : {} })
            cleanup()
          }
        }
        worker.onerror = event => { reject(new Error(event.message || 'CheerpJ worker failed')); cleanup() }
        worker.onmessageerror = () => { reject(new Error('Invalid CheerpJ worker message')); cleanup() }
      })
      signal.addEventListener('abort', abort, { once: true })
      try {
        worker.postMessage({ type: 'start', program, options: {
          ...defaultCheerpJOptions, ...options,
          loaderUrl
        } })
      } catch (error) { rejectResult!(error); cleanup() }
      return {
        stdinChunkBytes: 8192,
        result,
        async write(data) {
          signal.throwIfAborted()
          if (ended || inputEnded) throw new Error('Java stdin is closed')
          const id = nextInputId++
          await new Promise<void>((resolve, reject) => {
            pendingInput.set(id, { resolve, reject })
            try { worker.postMessage({ type: 'input', data, id }) }
            catch (error) { pendingInput.delete(id); reject(error) }
          })
        },
        async eof() {
          signal.throwIfAborted()
          if (ended || inputEnded) return
          inputEnded = true
          worker.postMessage({ type: 'eof' })
        }
      }
    }
  }
}

export const cheerpjBackend = createCheerpJBackend()
