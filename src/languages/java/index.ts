import { CompileError } from '../../core/errors'
import type { LanguageAdapter } from '../../core/types'
import { javaCompiler } from './toolchain.generated'

export const javaAdapter: LanguageAdapter = {
  kind: 'compiled',
  toolchain: javaCompiler,
  async prepare(source, context) {
    const compiler = context.fs['/javac-17.jar']
    if (!compiler || compiler.mode !== 'binary') throw new Error('Missing Java compiler toolchain')
    const result = await context.execute({ backend: 'java', payload: { action: 'compile', source, compiler: compiler.content } })
    const jar = result.fs['/main.jar']
    if (!jar || jar.mode !== 'binary') throw new CompileError('Java compiler did not produce a JAR')
    return { backend: 'java', payload: { action: 'run', jar: jar.content } }
  }
}
