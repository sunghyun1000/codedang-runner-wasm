import { build } from 'vite'
import { fileURLToPath } from 'node:url'

/** Bundle TS test subjects with the same tool used by production, without writing files. */
export async function importTestModule(relativePath) {
  const result = await build({
    configFile: false, logLevel: 'silent',
    build: {
      write: false, minify: false,
      lib: { entry: fileURLToPath(new URL(relativePath, import.meta.url)), formats: ['es'] }
    }
  })
  const output = Array.isArray(result) ? result[0].output : result.output
  const code = output.find(item => item.type === 'chunk' && item.isEntry).code
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}
