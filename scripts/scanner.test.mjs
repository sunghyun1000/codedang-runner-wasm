import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

test('Scanner compatibility matches the JDK for the shared console contract', async t => {
  // Tests require a local JDK; browser users do not.
  const executable = name => process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', name) : name
  try { execFileSync(executable('javac'), ['-version'], { stdio: 'pipe' }) }
  catch { t.skip('JDK unavailable; run with JAVA_HOME to exercise the Java contract'); return }
  await mkdir('/tmp/opencode', { recursive: true })
  const directory = await mkdtemp('/tmp/opencode/scanner-contract-')
  t.after(() => rm(directory, { recursive: true, force: true }))
  const root = fileURLToPath(new URL('../', import.meta.url))
  const fixture = join(root, 'tests/fixtures/java/scanner-contract/Main.java')
  const sources = join(root, 'scripts/java/scanner')
  const classes = join(directory, 'classes')
  const overlay = join(directory, 'overlay')
  execFileSync(executable('javac'), ['--release', '11', '-d', classes, fixture])
  execFileSync(executable('javac'), ['--release', '11', '--patch-module', `java.base=${sources}`, '-d', overlay,
    join(sources, 'java/util/Scanner.java'), join(sources, 'java/util/InputMismatchException.java')])
  const original = execFileSync(executable('java'), ['-cp', classes, 'Main'], { encoding: 'utf8' })
  const actual = execFileSync(executable('java'), ['--patch-module', `java.base=${overlay}`, '-cp', classes, 'Main'], { encoding: 'utf8' })
  assert.equal(actual, original)
})
