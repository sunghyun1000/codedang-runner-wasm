export type Language = 'C' | 'Cpp' | 'Java' | 'Python3'

export enum RunnerMessageType {
  CODE = 'code', INPUT = 'input', EXIT = 'exit',
  COMPILE_ERR = 'compile_error', ECHO = 'echo', STDOUT = 'stdout', STDERR = 'stderr', ERROR = 'error'
}

export type RunnerMessage = { type: RunnerMessageType.CODE; language: Language; source: string }
