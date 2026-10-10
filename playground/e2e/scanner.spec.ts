import { test, expect } from '@playwright/test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'

test('unmodified Scanner source compiles and accepts interactive integers', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Language' }).click()
  await page.getByRole('option', { name: 'Java', exact: true }).click()
  await page.locator('.cm-content').fill(`import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    System.out.print("INPUT_READY");
    int a = sc.nextInt();
    int b = sc.nextInt();
    System.out.println("SUM=" + (a + b));
  }
}`)
  await page.locator('#run').click()
  await expect(page.locator('#runner-container')).toContainText('INPUT_READY', { timeout: 20_000 })
  await page.locator('.xterm-helper-textarea').focus()
  await page.keyboard.insertText('7 5')
  await page.keyboard.press('Enter')
  await expect(page.locator('#runner-container')).toContainText('SUM=12', { timeout: 10_000 })
  await expect(page.locator('#runner-container')).toContainText('Process ended with exit code: 0')
})

test('Scanner WasmGC behavior matches the JDK contract', async ({ page }) => {
  const source = readFileSync('tests/fixtures/java/scanner-contract/Main.java', 'utf8')
  const directory = mkdtempSync('/tmp/opencode/scanner-browser-')
  const executable = (name: string) => process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', name) : name
  let expected: string
  try {
    execFileSync(executable('javac'), ['--release', '11', '-d', directory, 'tests/fixtures/java/scanner-contract/Main.java'])
    expected = execFileSync(executable('java'), ['-cp', directory, 'Main'], { encoding: 'utf8' }).replaceAll('\r\n', '\n')
  } finally { rmSync(directory, { recursive: true, force: true }) }
  await page.goto('/')
  const output = await page.evaluate(async ({ source, moduleUrl }) => {
    const { createLocalRunnerConnection } = await import(/* @vite-ignore */ moduleUrl)
    return new Promise<string>((resolve, reject) => {
      let stdout = ''
      const connection = createLocalRunnerConnection({ timeoutMs: 60_000 })
      connection.onmessage = (event: MessageEvent<string>) => {
        const message = JSON.parse(event.data)
        if (message.type === 'stdout') stdout += message.data
        if (message.type === 'error' || message.type === 'compile_error') reject(new Error(message.error ?? message.stderr))
        if (message.type === 'exit' && message.return_code !== 0) reject(new Error(`Exit ${message.return_code}`))
      }
      connection.onclose = () => resolve(stdout)
      connection.onopen = () => connection.send(JSON.stringify({ type: 'code', language: 'Java', source }))
    })
  }, { source, moduleUrl: `/@fs${resolve('src/index.ts')}` })
  expect(output).toBe(expected!)
})

test('Scanner lookahead, line mixing, Unicode and EOF work interactively', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Language' }).click()
  await page.getByRole('option', { name: 'Java', exact: true }).click()
  await page.locator('.cm-content').fill(`import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in, "UTF-8");
    System.out.print("INPUT_READY");
    System.out.println("PEEK=" + sc.hasNextInt());
    System.out.println("INT=" + sc.nextInt());
    System.out.println("REST=[" + sc.nextLine() + "]");
    System.out.print("LINE_READY");
    System.out.println("LINE=" + sc.nextLine());
    System.out.print("EOF_WAIT");
    System.out.println("END=" + sc.hasNext());
    sc.close();
  }
}`)
  await page.locator('#run').click()
  await expect(page.locator('#runner-container')).toContainText('INPUT_READY', { timeout: 20_000 })
  await page.locator('.xterm-helper-textarea').focus()
  await page.keyboard.insertText('42 tail')
  await page.keyboard.press('Enter')
  await expect(page.locator('#runner-container')).toContainText('PEEK=true', { timeout: 10_000 })
  await expect(page.locator('#runner-container')).toContainText('INT=42')
  await expect(page.locator('#runner-container')).toContainText('REST=[ tail]')
  await expect(page.locator('#runner-container')).toContainText('LINE_READY')
  await page.keyboard.insertText('한글🙂')
  await page.keyboard.press('Enter')
  await expect(page.locator('#runner-container')).toContainText('LINE=한글🙂')
  await expect(page.locator('#runner-container')).toContainText('EOF_WAIT')
  await page.keyboard.press('Control+d')
  await expect(page.locator('#runner-container')).toContainText('END=false')
  await expect(page.locator('#runner-container')).toContainText('Process ended with exit code: 0')
})

test('Scanner waits for token completion and accepts a final token at EOF', async ({ page }) => {
  await page.goto('/')
  const output = await page.evaluate(async moduleUrl => {
    const { createLocalRunnerConnection } = await import(/* @vite-ignore */ moduleUrl)
    return new Promise<string>((resolve, reject) => {
      let stdout = ''
      let sentFirst = false
      let sentLast = false
      const connection = createLocalRunnerConnection({ timeoutMs: 30_000 })
      connection.onmessage = (event: MessageEvent<string>) => {
        const message = JSON.parse(event.data)
        if (message.type === 'error' || message.type === 'compile_error') reject(new Error(message.error ?? message.stderr))
        if (message.type !== 'stdout') return
        stdout += message.data
        if (stdout.includes('FIRST_READY') && !sentFirst) {
          sentFirst = true
          connection.send(JSON.stringify({ type: 'input', data: '12' }))
          setTimeout(() => {
            if (stdout.includes('PEEK=')) reject(new Error('hasNextInt returned before the token was complete'))
            connection.send(JSON.stringify({ type: 'input', data: ' ' }))
          }, 150)
        }
        if (stdout.includes('LAST_READY') && !sentLast) {
          sentLast = true
          connection.send(JSON.stringify({ type: 'input', data: '-3' }))
          connection.closeStdin()
        }
      }
      connection.onclose = () => resolve(stdout)
      connection.onopen = () => connection.send(JSON.stringify({ type: 'code', language: 'Java', source: `
import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    Scanner s = new Scanner(System.in);
    System.out.print("FIRST_READY");
    System.out.println("PEEK=" + s.hasNextInt());
    int first = s.nextInt();
    System.out.print("LAST_READY");
    System.out.println("SUM=" + (first + s.nextInt()));
    System.out.println("END=" + s.hasNext());
  }
}` }))
    })
  }, `/@fs${resolve('src/index.ts')}`)
  expect(output).toContain('PEEK=true')
  expect(output).toContain('SUM=9')
  expect(output).toContain('END=false')
})
