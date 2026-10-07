import { codedangLanguages, createLocalRunnerConnection } from '../../src'
import type { RunnerConnection } from '../../src'
import './style.css'

const source = document.querySelector<HTMLTextAreaElement>('#source')!
const language = document.querySelector<HTMLSelectElement>('#language')!
const output = document.querySelector<HTMLPreElement>('#output')!
const status = document.querySelector<HTMLElement>('#status')!
const runButton = document.querySelector<HTMLButtonElement>('#run')!
const stopButton = document.querySelector<HTMLButtonElement>('#stop')!
const input = document.querySelector<HTMLInputElement>('#stdin')!
const sendButton = document.querySelector<HTMLButtonElement>('#send')!
const inputForm = document.querySelector<HTMLFormElement>('#input-form')!

const examples: Record<string, string> = {
  C: `#include <stdio.h>\n\nint main(void) {\n  printf("Hello from C!\\n");\n  return 0;\n}`,
  Cpp: `#include <iostream>\n\nint main() {\n  std::cout << "Hello from C++!\\n";\n  return 0;\n}`,
  Python3: `print("Hello from Python 3!")`,
  Java: `import java.util.Scanner;\n\npublic class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello from Java 17! Enter your name:");\n    Scanner input = new Scanner(System.in);\n    if (input.hasNextLine()) {\n      System.out.println("Hello, " + input.nextLine() + "!");\n    }\n  }\n}`
}

source.value = examples[language.value]
language.addEventListener('change', () => { source.value = examples[language.value] })

let connection: RunnerConnection | undefined

function setRunning(running: boolean, label = running ? 'Running' : 'Ready') {
  status.textContent = label
  runButton.disabled = running
  stopButton.disabled = !running
  sendButton.disabled = !running
  input.disabled = !running
  if (running) input.focus()
}

function append(text: string) {
  output.textContent += text
  output.scrollTop = output.scrollHeight
}

runButton.addEventListener('click', async () => {
  connection?.close()
  output.textContent = ''
  setRunning(true, 'Starting…')

  try {
    connection = createLocalRunnerConnection({
      languages: codedangLanguages,
      assetBaseUrl: new URL('/runno/langs/', location.origin).href,
      timeoutMs: 180_000
    })
    connection.onopen = () => connection?.send(JSON.stringify({
      type: 'code', language: language.value, source: source.value
    }))
    connection.onmessage = event => {
      const message = JSON.parse(event.data)
      if (message.type === 'stdout' || message.type === 'stderr') append(message.data)
      if (message.type === 'compile_error') append(`Compile error: ${message.stderr}\n`)
      if (message.type === 'error') append(`Runner error: ${message.error}\n`)
      if (message.type === 'exit') append(`\n[process exited: ${message.return_code}]\n`)
    }
    connection.onclose = () => setRunning(false, 'Finished')
    connection.onerror = () => {
      append('Connection error\n')
      setRunning(false, 'Error')
    }
  } catch (error) {
    append(`Runner error: ${error instanceof Error ? error.message : String(error)}\n`)
    setRunning(false, 'Error')
  }
})

stopButton.addEventListener('click', () => connection?.send('{"type":"exit"}'))

input.addEventListener('keydown', event => {
  if (event.ctrlKey && event.key.toLowerCase() === 'd') {
    event.preventDefault()
    if (connection?.readyState === 1) connection.closeStdin()
  }
})

inputForm.addEventListener('submit', event => {
  event.preventDefault()
  if (!connection || !input.value) return
  connection.send(JSON.stringify({ type: 'input', data: `${input.value}\n` }))
  append(`> ${input.value}\n`)
  input.value = ''
})

input.disabled = true
