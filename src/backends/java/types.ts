import type { CheerpJOptions } from '../../config'
import type { LoaderOptions } from '../../toolchains/loader'
export type { CheerpJOptions } from '../../config'

export type JavaProgram =
  | { action: 'compile'; source: string; compiler: Uint8Array }
  | { action: 'run'; jar: Uint8Array }

export type JavaWorkerRequest =
  | { type: 'start'; program: JavaProgram; options: CheerpJOptions; assets?: LoaderOptions }
  | { type: 'input'; data: string; id: number }
  | { type: 'eof' }

export type JavaWorkerResponse =
  | { type: 'input_consumed'; id: number }
  | { type: 'stdout' | 'stderr'; data: string }
  | { type: 'result'; exitCode: number; jar?: Uint8Array }
  | { type: 'error'; error: string }
