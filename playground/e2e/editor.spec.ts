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
