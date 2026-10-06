import { errorText, type ServerMessage } from './protocol'
import { StdinQueue } from './stdin-queue'
import { ToolchainLoader, type LoaderOptions } from './toolchains/loader'
import type { ToolchainManifest } from './toolchains/manifest'
import { codedangLanguages } from './languages'
import { runnoRuntime, type WasiProgram, type WasiRuntime, type WASIFS, type WASIExecutionResult } from './runtime/runno'

export interface LanguageContext {
  fs: WASIFS
  signal: AbortSignal
  /** Runs a compiler/helper with EOF on stdin; diagnostics are bounded. */
  execute(program: WasiProgram): Promise<WASIExecutionResult & { stdout: string; stderr: string }>
}

export interface LanguageAdapter {
  kind: 'compiled' | 'interpreted'
  toolchain?: ToolchainManifest
  prepare(source: string, context: LanguageContext): Promise<WasiProgram>
}

export interface RunnerOptions extends LoaderOptions {
  languages?: Readonly<Record<string, LanguageAdapter>>
  runtime?: WasiRuntime
  timeoutMs?: number
  maxOutputBytes?: number
  maxInputBytes?: number
}

export type SessionState = 'ready' | 'preparing' | 'compiling' | 'running' | 'finished'

export class CompileError extends Error {}

export class RunnerSession {
  state: SessionState = 'ready'
  private readonly controller = new AbortController()
  private readonly input: StdinQueue
  private timer?: ReturnType<typeof setTimeout>
  private outputBytes = 0

  constructor(
    private readonly options: RunnerOptions,
    private readonly emit: (message: ServerMessage) => void,
    private readonly onClose: () => void
  ) {
    this.input = new StdinQueue(error => this.fail(error), options.maxInputBytes)
  }

  inputText(data: string): void {
    if (this.state === 'ready' || this.state === 'finished') throw new Error('No active program')
    this.input.push(data)
    this.emit({ type: 'echo', data })
  }

  eof(): void { this.input.end() }

  async start(language: string, source: string): Promise<void> {
    if (this.state !== 'ready') throw new Error('Only one execution is allowed per connection')
    const adapter = this.options.languages?.[language] ?? codedangLanguages[language]
    if (!adapter) {
      this.fail(new Error(`Unsupported local language: ${language}`))
      return
    }
    this.state = 'preparing'
    this.timer = setTimeout(() => this.fail(new Error('Time limit exceeded')), this.options.timeoutMs ?? 180_000)
    const signal = this.controller.signal
    const runtime = this.options.runtime ?? runnoRuntime
    try {
      const fs = adapter.toolchain
        ? await new ToolchainLoader(this.options).load(adapter.toolchain, signal)
        : {}
      signal.throwIfAborted()
      if (adapter.kind === 'compiled') this.state = 'compiling'

      let diagnostics = ''
      const program = await adapter.prepare(source, {
        fs,
        signal,
        execute: async program => {
          let stdout = ''
          let stderr = ''
          const process = runtime.start(program, {
            stdout: text => { if (this.countOutput(text)) stdout += text },
            stderr: text => { if (this.countOutput(text)) stderr += text }
          }, signal)
          // Observe the result before attempting EOF, so failures cannot go unhandled.
          const result = await Promise.all([process.result, process.eof()]).then(([result]) => result)
          diagnostics += stdout + stderr
          if (result.exitCode !== 0) throw new CompileError(stderr || stdout || `Compiler exited with ${result.exitCode}`)
          return { ...result, stdout, stderr }
        }
      })
      signal.throwIfAborted()
      if (adapter.kind === 'compiled') this.emit({ type: 'compile_success', stdout: diagnostics })
      this.state = 'running'
      const process = runtime.start(program, {
        stdout: data => this.output('stdout', data),
        stderr: data => this.output('stderr', data)
      }, signal)
      this.input.attach(process)
      const result = await process.result
      this.finish({ type: 'exit', return_code: result.exitCode })
    } catch (error) {
      this.fail(error)
    }
  }

  stop(): void {
    this.finish({ type: 'exit', return_code: 130, error: 'Execution cancelled' })
  }

  /** Closing the transport silently stops its execution. */
  close(): void { this.finish() }

  private countOutput(text: string): boolean {
    if (this.state === 'finished') return false
    this.outputBytes += new TextEncoder().encode(text).length
    if (this.outputBytes > (this.options.maxOutputBytes ?? 100_000)) {
      this.fail(new Error('Output limit exceeded'))
      return false
    }
    return true
  }

  private output(type: 'stdout' | 'stderr', data: string): void {
    if (this.state === 'finished') return
    if (!this.countOutput(data)) return
    this.emit({ type, data })
  }

  private fail(error: unknown): void {
    this.finish(error instanceof CompileError
      ? { type: 'compile_error', stderr: error.message }
      : { type: 'error', error: errorText(error) })
  }

  private finish(message?: ServerMessage): void {
    if (this.state === 'finished') return
    this.state = 'finished'
    clearTimeout(this.timer)
    this.input.close()
    this.controller.abort()
    if (message) this.emit(message)
    this.onClose()
  }
}
