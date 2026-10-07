import { bridgeJar } from './bridge.generated'
import type { JavaProgram, JavaWorkerRequest, JavaWorkerResponse, CheerpJOptions } from './types'

declare function cheerpjInit(options: Record<string, unknown>): Promise<void>
declare function cheerpOSAddStringFile(path: string, content: string | Uint8Array): void
declare function cheerpjRunMain(className: string, classPath: string, ...args: string[]): Promise<number>

const send = (message: JavaWorkerResponse) => self.postMessage(message)
const chunks: { id: number; data: string }[] = []
let inputEnded = false
let wake: (() => void) | undefined
let started = false
const decoders = { stdout: new TextDecoder(), stderr: new TextDecoder() }

self.onmessage = (event: MessageEvent<JavaWorkerRequest>) => {
  const message = event.data
  if (message.type === 'input' && !inputEnded) { chunks.push(message); wake?.() }
  if (message.type === 'eof') { inputEnded = true; wake?.() }
  if (message.type === 'start' && !started) {
    started = true
    void run(message.program, message.options).catch(error => {
      send({ type: 'error', error: error instanceof Error ? error.message : String(error) })
    })
  }
}

async function run(program: JavaProgram, options: CheerpJOptions) {
  let jar: Uint8Array | undefined
  await cheerpjInit({
    version: 17, status: 'none', licenseKey: options.licenseKey,
    javaProperties: ['file.encoding=UTF-8', 'java.awt.headless=true'],
    natives: {
      async Java_codedang_runner_Bridge_readInput() {
        while (!chunks.length && !inputEnded) await new Promise<void>(resolve => { wake = resolve })
        wake = undefined
        const chunk = chunks.shift()
        if (!chunk) return null
        send({ type: 'input_consumed', id: chunk.id })
        return chunk.data
      },
      async Java_codedang_runner_Bridge_writeOutput(_lib: unknown, bytes: Int8Array, offset: number, length: number, stderr: boolean) {
        const type = stderr ? 'stderr' : 'stdout'
        const data = decoders[type].decode(new Uint8Array(bytes.buffer, bytes.byteOffset + offset, length), { stream: true })
        if (data) send({ type, data })
      },
      async Java_codedang_runner_Bridge_compiled(_lib: unknown, bytes: Int8Array) {
        jar = new Uint8Array(bytes)
      }
    }
  })
  cheerpOSAddStringFile('/str/bridge.jar', Uint8Array.from(atob(bridgeJar), char => char.charCodeAt(0)))
  let exitCode: number
  if (program.action === 'compile') {
    cheerpOSAddStringFile('/str/javac.jar', program.compiler)
    cheerpOSAddStringFile('/str/Main.java', program.source)
    exitCode = await cheerpjRunMain('codedang.runner.Bridge', '/str/bridge.jar:/str/javac.jar', 'compile')
    if (exitCode === 0 && !jar) throw new Error('Java compiler did not produce a JAR')
  } else {
    cheerpOSAddStringFile('/str/main.jar', program.jar)
    exitCode = await cheerpjRunMain('codedang.runner.Bridge', '/str/bridge.jar', 'run')
  }
  for (const type of ['stdout', 'stderr'] as const) {
    const data = decoders[type].decode()
    if (data) send({ type, data })
  }
  send({ type: 'result', exitCode, jar })
}
