import type { LanguageAdapter } from '../core/types'
import { cAdapter } from './c'
import { cppAdapter } from './cpp'
import { pythonAdapter } from './python3'

/** Adapters use Codedang's API language identifiers. */
export const codedangLanguages: Readonly<Record<string, LanguageAdapter>> = {
  C: cAdapter,
  Cpp: cppAdapter,
  Python3: pythonAdapter
}

export { cAdapter } from './c'
export { cppAdapter } from './cpp'
export { pythonAdapter } from './python3'
