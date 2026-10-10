import { execFileSync } from 'node:child_process'
import { globSync } from 'node:fs'
import { homedir } from 'node:os'
import { copyFile, mkdir, writeFile, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// Build upstream exactly as-is. JDK 25 is required by this pinned revision.
const commit = '208d4c97a602ba0df055f16e6882059fb69d0122'
const directory = fileURLToPath(new URL('../.toolchains/java/teavm-javac/', import.meta.url))
const source = join(directory, 'build-source')
const project = fileURLToPath(new URL('../', import.meta.url))
await mkdir(directory, { recursive: true })
try { await access(join(source, '.git')) }
catch {
  execFileSync('git', ['clone', 'https://github.com/konsoletyper/teavm-javac.git', source], { stdio: 'inherit' })
  execFileSync('git', ['checkout', '--detach', commit], { cwd: source, stdio: 'inherit' })
}
const git = args => execFileSync('git', args, { cwd: source, encoding: 'utf8' }).trim()
if (git(['rev-parse', 'HEAD']) !== commit || git(['status', '--porcelain'])) {
  throw new Error(`Build source must be clean at ${commit}; existing checkout was not modified`)
}
execFileSync('./gradlew', [':compiler:createDist', '--no-daemon'], { cwd: source, stdio: 'inherit' })
const distribution = globSync(join(source, 'compiler/build/distributions/*.zip'))[0]
if (distribution) await copyFile(distribution, join(directory, 'upstream-dist.zip'))
for (const name of ['compiler.wasm', 'compiler.wasm-runtime.js']) {
  await copyFile(join(source, 'compiler/build/generated/teavm/wasm-gc', name), join(directory, name))
}
for (const name of ['compile-classlib-teavm.bin', 'runtime-classlib-teavm.bin']) {
  await copyFile(join(source, 'compiler/build/classlib', name), join(directory, name))
}
const classlib = globSync(join(process.env.GRADLE_USER_HOME ?? join(homedir(), '.gradle'),
  'caches/modules-2/files-2.1/org.teavm/teavm-classlib/0.16.0/*/teavm-classlib-0.16.0.jar'))[0]
if (!classlib) throw new Error('TeaVM classlib build dependency was not found')
const overlay = join(directory, 'overlay-build')
await mkdir(overlay, { recursive: true })
const executable = name => process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', name) : name
execFileSync(executable('javac'), ['--release', '11', '-cp', classlib, '-d', overlay,
  join(project, 'scripts/java/TInputStreamReader.java'), join(project, 'scripts/java/BuildCompatibilityOverlay.java')],
{ stdio: 'inherit' })
execFileSync(executable('javac'), ['--release', '11', '-d', overlay,
  join(project, 'scripts/java/BuildScannerOverlay.java')], { stdio: 'inherit' })
const scannerSource = join(project, 'scripts/java/scanner')
const scannerClasses = join(overlay, 'scanner')
await mkdir(scannerClasses, { recursive: true })
execFileSync(executable('javac'), ['--release', '11', '--patch-module', `java.base=${scannerSource}`,
  '-d', scannerClasses, join(scannerSource, 'java/util/Scanner.java'),
  join(scannerSource, 'java/util/InputMismatchException.java')], { stdio: 'inherit' })
execFileSync(executable('java'), ['-cp', overlay, 'BuildScannerOverlay',
  scannerClasses, join(directory, 'scanner-sdk.bin'), join(directory, 'scanner-runtime.bin')],
{ stdio: 'inherit' })
execFileSync(executable('java'), ['-cp', overlay, 'BuildCompatibilityOverlay',
  join(overlay, 'org/teavm/classlib/java/io/TInputStreamReader.class'), join(directory, 'runtime-compat.bin')],
{ stdio: 'inherit' })
await writeFile(join(directory, 'PROVENANCE.json'), JSON.stringify({
  repository: 'https://github.com/konsoletyper/teavm-javac', commit,
  build: './gradlew :compiler:createDist --no-daemon', sourceModified: false,
  compatibilityOverlay: 'Reader and Scanner overlays are built separately from scripts/java; upstream files stay unchanged'
}, null, 2) + '\n')
await copyFile(join(source, 'README.md'), join(directory, 'UPSTREAM-README.md'))
const license = globSync(join(source, 'javac/build/jdk/*/LICENSE'))[0]
if (license) await copyFile(license, join(directory, 'OPENJDK-LICENSE'))
// Keep the corresponding OpenJDK source license when available in the upstream build.
console.log('Built unmodified upstream TeaVM javac. Keep build-source for corresponding sources and license notices.')
