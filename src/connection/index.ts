import { parseMessage, errorText, type ServerMessage } from './protocol'
import { RunnerSession } from '../core/runner'
import type { RunnerOptions } from '../core/types'
import { codedangLanguages } from '../languages'
import { runnoBackend } from '../backends/wasi/runno'

export const ConnectionState = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 } as const

export interface RunnerConnection {
  readonly readyState: number
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent<string>) => void) | null
  onerror: ((event: Event) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  send(data: string): void
  close(): void
  /** Local extension; the existing wire protocol has no EOF message. */
  closeStdin(): void
}

class LocalRunnerConnection implements RunnerConnection {
  readyState: number = ConnectionState.CONNECTING
  onopen: RunnerConnection['onopen'] = null
  onmessage: RunnerConnection['onmessage'] = null
  onerror: RunnerConnection['onerror'] = null
  onclose: RunnerConnection['onclose'] = null
  private readonly session: RunnerSession

  constructor(options: RunnerOptions) {
    this.session = new RunnerSession({
      ...options,
      languages: { ...codedangLanguages, ...options.languages },
      backends: { wasi: runnoBackend, ...options.backends }
    }, message => this.deliver(message), () => this.closed())
    queueMicrotask(() => {
      if (this.readyState !== ConnectionState.CONNECTING) return
      this.readyState = ConnectionState.OPEN
      this.onopen?.(new Event('open'))
    })
  }

  send(data: string): void {
    if (this.readyState !== ConnectionState.OPEN) throw new Error('Runner connection is not open')
    try {
      const message = parseMessage(data)
      switch (message.type) {
        case 'code':
          void this.session.start(message.language, message.source).catch(error => this.invalid(error))
          break
        case 'input': this.session.inputText(message.data); break
        case 'exit': this.session.stop(); break
      }
    } catch (error) { this.invalid(error) }
  }

  closeStdin(): void {
    if (this.readyState !== ConnectionState.OPEN) throw new Error('Runner connection is not open')
    this.session.eof()
  }

  close(): void {
    if (this.readyState === ConnectionState.CLOSED) return
    this.readyState = ConnectionState.CLOSING
    this.session.close()
  }

  private invalid(error: unknown): void {
    this.deliver({ type: 'error', error: errorText(error) })
  }

  private deliver(message: ServerMessage): void {
    queueMicrotask(() => {
      this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(message) }))
    })
  }

  private closed(): void {
    this.readyState = ConnectionState.CLOSED
    queueMicrotask(() => {
      this.onclose?.(new CloseEvent('close', { code: 1000, wasClean: true }))
    })
  }
}

export function createLocalRunnerConnection(options: RunnerOptions = {}): RunnerConnection {
  return new LocalRunnerConnection(options)
}
