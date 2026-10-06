import { WASIWorkerHost } from '../../runno/packages/wasi/lib/worker/wasi-host'
import type { WASIExecutionResult, WASIFS } from '../../runno/packages/wasi/lib/types'
import type { StdinTarget } from '../stdin-queue'

export type { WASIFS, WASIExecutionResult }

export interface WasiProgram {
  binary: Uint8Array
  fs?: WASIFS
  args?: string[]
  env?: Record<string, string>
  isTTY?: boolean
}

export interface RunningProgram extends StdinTarget {
  result: Promise<WASIExecutionResult>
}

export interface WasiRuntime {
  start(
    program: WasiProgram,
    output: { stdout: (text: string) => void; stderr: (text: string) => void },
    signal: AbortSignal
  ): RunningProgram
}

export const runnoRuntime: WasiRuntime = {
  start(program, output, signal) {
    signal.throwIfAborted()
    if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
      throw new Error('WASI requires cross-origin isolation (COOP/COEP headers)')
    }
    const url = URL.createObjectURL(new Blob(
      [program.binary as Uint8Array<ArrayBuffer>], { type: 'application/wasm' }
    ))
    const host = new WASIWorkerHost(url, {
      fs: program.fs,
      args: program.args,
      env: program.env,
      isTTY: program.isTTY ?? true,
      ...output
    })
    let finished = false
    const abort = () => { if (host.worker) host.kill() }
    signal.addEventListener('abort', abort, { once: true })
    const result = host.start().finally(() => {
      finished = true
      signal.removeEventListener('abort', abort)
      // Upstream only terminates automatically on successful completion.
      host.worker?.terminate()
      URL.revokeObjectURL(url)
    })

    async function waitForInput(): Promise<void> {
      const view = new DataView(host.stdinBuffer)
      while (view.getInt32(0) !== 0) {
        signal.throwIfAborted()
        if (finished) throw new Error('Program has ended')
        await new Promise(resolve => setTimeout(resolve, 4))
      }
      signal.throwIfAborted()
      if (finished) throw new Error('Program has ended')
    }

    return {
      result,
      async write(text) {
        await waitForInput()
        await host.pushStdin(text)
      },
      async eof() {
        await waitForInput()
        await host.pushEOF()
      }
    }
  }
}
