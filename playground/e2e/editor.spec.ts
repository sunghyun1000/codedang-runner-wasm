import { test, expect, type Page } from '@playwright/test'

async function selectLanguage(page: Page, language: string) {
  await page.getByRole('combobox', { name: 'Language' }).click()
  await page.getByRole('option', { name: language, exact: true }).click()
}

async function setSource(page: Page, source: string) {
  await page.locator('.cm-content').fill(source)
}

test.beforeEach(async ({ page }) => { await page.goto('/') })

test('original editor controls, disabled server actions and per-language sources', async ({ page }) => {
  for (const name of ['Reset', 'Save', 'Test', 'Submit']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeDisabled()
  }
  await expect(page.getByRole('tab', { name: 'Submissions' })).toBeDisabled()
  await setSource(page, '// preserved C++ source')
  await selectLanguage(page, 'Python3')
  await expect(page.locator('.cm-content')).toContainText('Hello from Python')
  await selectLanguage(page, 'Cpp')
  await expect(page.locator('.cm-content')).toContainText('// preserved C++ source')
  await page.getByRole('button', { name: 'Increase Font Size', exact: true }).click()
  await expect(page.locator('.cm-editor')).toHaveCSS('font-size', '18px')
})

for (const [language, greeting] of [['C', 'Hello from C!'], ['Cpp', 'Hello from C++!'], ['Python3', 'Hello from Python 3!']]) {
  test(`${language} runs locally without WebSocket`, async ({ page }) => {
    let sockets = 0
    page.on('websocket', socket => { if (!socket.url().includes('vite')) sockets++ })
    await selectLanguage(page, language)
    await page.locator('#run').click()
    await expect(page.locator('#runner-container')).toContainText(greeting)
    await expect(page.locator('#runner-container')).toContainText('Process ended with exit code: 0')
    await expect(page.locator('#run')).toBeEnabled()
    // Vite's HMR socket is connected before this listener; runner uses no socket.
    expect(sockets).toBe(0)
  })
}

test('multiline stdin preserves blank lines and Ctrl+D sends EOF', async ({ page }) => {
  await selectLanguage(page, 'Python3')
  await setSource(page, 'import sys\nprint("INPUT_READY", flush=True)\nlines = list(sys.stdin)\nprint(repr(lines))\n')
  await page.locator('#run').click()
  await expect(page.locator('#runner-container')).toContainText('INPUT_READY')
  await page.locator('.xterm-helper-textarea').focus()
  await page.locator('.xterm-helper-textarea').evaluate(element => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', 'first\n\nlast\n')
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true }))
  })
  await page.keyboard.press('Control+d')
  await expect(page.locator('#runner-container')).toContainText("['first\\n', '\\n', 'last\\n']")
  await expect(page.locator('#runner-container')).toContainText('Process ended with exit code: 0')
})

test('Java compiles and receives interactive stdin through CheerpJ', async ({ page }) => {
  let phase = 0
  const compilerRanges = new Set<string>()
  const repeatedRuntimeRanges: string[] = []
  page.on('request', request => {
    if (request.url().endsWith('/4.3/loader.js')) phase++
    if (!request.url().endsWith('/4.3/17/lib/modules')) return
    const range = request.headers()['range']
    if (!range) return
    if (phase === 1) compilerRanges.add(range)
    else if (phase === 2 && compilerRanges.has(range)) repeatedRuntimeRanges.push(range)
  })
  await selectLanguage(page, 'Java')
  await page.locator('#run').click()
  await expect(page.locator('#runner-container')).toContainText('Enter your name:')
  await page.locator('.xterm-helper-textarea').focus()
  await page.keyboard.type('Codedang')
  await page.keyboard.press('Enter')
  await expect(page.locator('#runner-container')).toContainText('Hello, Codedang!')
  await expect(page.locator('#runner-container')).toContainText('Process ended with exit code: 0')
  expect(phase).toBe(2)
  expect(compilerRanges.size).toBeGreaterThan(0)
  expect(repeatedRuntimeRanges).toEqual([])
  const cachedRanges = await page.evaluate(async () => {
    const cache = await caches.open('codedang-cheerpj-runtime-v1')
    return (await cache.keys()).filter(request => request.url.includes('/17/lib/modules')).length
  })
  expect(cachedRanges).toBeGreaterThan(0)
})

test('ECJ compiles Java 17 records, nested classes and lambda expressions', async ({ page }) => {
  await selectLanguage(page, 'Java')
  await setSource(page, `import java.util.List;
public class Main {
  record Item(int value) {}
  public static void main(String[] args) {
    var items = List.of(new Item(7), new Item(5));
    System.out.println(items.stream().mapToInt(item -> item.value()).sum());
  }
}`)
  await page.locator('#run').click()
  await expect(page.locator('#runner-container')).toContainText('Process ended with exit code: 0')
  await expect(page.locator('#runner-container')).toContainText('12')
})

test('ECJ reports Java syntax errors without executing', async ({ page }) => {
  await selectLanguage(page, 'Java')
  await setSource(page, 'public class Main { public static void main(String[] args) { int value = ; } }')
  await page.locator('#run').click()
  await expect(page.locator('#runner-container')).toContainText('Main.java:1:')
  await expect(page.locator('#run')).toBeEnabled()
  await expect(page.locator('#runner-container')).not.toContainText('Process ended with exit code: 0')
})

test('Ctrl+C stops and Ctrl+Enter starts a new execution', async ({ page }) => {
  await selectLanguage(page, 'Python3')
  await setSource(page, 'print("WAITING", flush=True)\ninput()\n')
  await page.locator('#run').click()
  await expect(page.locator('#runner-container')).toContainText('WAITING')
  await page.locator('.xterm-helper-textarea').focus()
  await page.keyboard.press('Control+c')
  await expect(page.locator('#run')).toBeEnabled()
  await setSource(page, 'print("SECOND_RUN")\n')
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('#runner-container')).toContainText('SECOND_RUN')
  await expect(page.locator('#runner-container')).not.toContainText('WAITING')
  await expect(page.locator('#runner-container')).toContainText('Process ended with exit code: 0')
})

test('compile errors are displayed in the terminal', async ({ page }) => {
  await setSource(page, 'int main( {')
  await page.locator('#run').click()
  await expect(page.locator('#runner-container')).toContainText('errors generated.')
  await expect(page.locator('#run')).toBeEnabled()
})
