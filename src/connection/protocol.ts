export type ClientMessage =
  | { type: 'code'; language: string; source: string }
  | { type: 'input'; data: string }
  | { type: 'exit' }

export type { RunnerEvent as ServerMessage } from '../core/types'
export { errorText } from '../core/errors'

export function parseMessage(json: string): ClientMessage {
  const message: unknown = JSON.parse(json)
  if (!message || typeof message !== 'object') throw new Error('Invalid message')

  const value = message as Record<string, unknown>
  if (value.type === 'exit') return { type: 'exit' }
  if (value.type === 'input' && typeof value.data === 'string') {
    return { type: 'input', data: value.data }
  }
  if (
    value.type === 'code' &&
    typeof value.language === 'string' &&
    typeof value.source === 'string'
  ) {
    return { type: 'code', language: value.language, source: value.source }
  }
  throw new Error('Invalid runner message')
}
