import type { LoaderOptions } from '../toolchains/loader'
import type { ToolchainManifest } from '../toolchains/manifest'
import type { CheerpJOptions } from '../config'

/** Portable files supplied to a language adapter, independent of its engine. */
export type FileSystem = Record<string, {
  path: string
  timestamps: { access: Date; modification: Date; change: Date }
} & (
  | { mode: 'string'; content: string }
  | { mode: 'binary'; content: Uint8Array }
)>

/** The selected backend owns and validates its payload. */
export interface Program {
  backend: string
  payload: unknown
}

export interface ExecutionResult {
  exitCode: number
  fs: FileSystem
}

export interface Output {
  stdout(text: string): void
  stderr(text: string): void
}

export type RunnerEvent =
  | { type: 'compile_success'; stdout: string }
  | { type: 'compile_error'; stderr: string }
  | { type: 'echo' | 'stdout' | 'stderr'; data: string }
  | { type: 'exit'; return_code: number; error?: string }
  | { type: 'error'; error: string }

export interface StdinTarget {
  /** Maximum UTF-8 chunk accepted by this engine. */
  stdinChunkBytes?: number
  write(data: string): Promise<void>
  eof(): Promise<void>
}

export interface RunningProgram extends StdinTarget {
  result: Promise<ExecutionResult>
}

export interface Backend {
  start(payload: unknown, output: Output, signal: AbortSignal): RunningProgram
}

export interface LanguageContext {
  fs: FileSystem
  signal: AbortSignal
  /** Runs a compiler/helper with EOF on stdin; diagnostics are bounded. */
  execute(program: Program): Promise<ExecutionResult & { stdout: string; stderr: string }>
}

export interface LanguageAdapter {
  kind: 'compiled' | 'interpreted'
  toolchain?: ToolchainManifest
  prepare(source: string, context: LanguageContext): Promise<Program>
}

export interface RunnerOptions extends LoaderOptions {
  java?: CheerpJOptions
  languages?: Readonly<Record<string, LanguageAdapter>>
  backends?: Readonly<Record<string, Backend>>
  timeoutMs?: number
  maxOutputBytes?: number
  maxInputBytes?: number
}

export type SessionState = 'ready' | 'preparing' | 'compiling' | 'running' | 'finished'
