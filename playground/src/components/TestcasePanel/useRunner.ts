'use client'

import { createLocalRunnerConnection, ConnectionState } from '../../../../src'
import {
  RunnerMessageType,
  type Language,
  type RunnerMessage
} from '@/types/type'
// Do not import xterm statically to avoid SSR issues
// Only importing types from xterm is fine
import type { Terminal } from '@xterm/xterm'
import { useRef, useEffect, useState } from 'react'

const compileMessageGenerator = (
  source: string,
  language: Language
): RunnerMessage => {
  return {
    type: RunnerMessageType.CODE,
    language,
    source
  }
}

const connectRunner = (
  terminal: Terminal,
  source: string,
  language: Language,
  onFinished: () => void
) => {
  const ws = createLocalRunnerConnection({
    assetBaseUrl: new URL('/toolchains/', location.origin).href,
    timeoutMs: 180_000
  })
  let currentInputBuffer = ''
  let cursorPosition = 0
  let isConnected = false
  let isComposing = false
  let lastComposedText = ''
  let outputLength = 0 // 출력 길이 추적용 변수 추가

  terminal.writeln('[SYS] Connecting to the runner...')

  const sendExitMessage = () => {
    if (ws.readyState === ConnectionState.OPEN) {
      const exitMsg = {
        type: RunnerMessageType.EXIT
      }
      ws.send(JSON.stringify(exitMsg))
      terminal.writeln('\n\n[SYS] Stopped the local runner')
      ws.close()
    }
  }

  const isFullWidthCharacter = (char: string) => {
    if (!char) {
      return false
    }
    const code = char.charCodeAt(0)
    return (
      (code >= 0x1100 && code <= 0x11ff) || // 한글 자모
      (code >= 0x3130 && code <= 0x318f) || // 한글 호환 자모
      (code >= 0xac00 && code <= 0xd7a3) || // 한글 음절
      (code >= 0xff01 && code <= 0xff60) || // 전각 구두점
      (code >= 0xffe0 && code <= 0xffe6) // 전각 기호
    )
  }

  const processLine = (line: string) => {
    if (ws.readyState === ConnectionState.OPEN) {
      const inputMsg = {
        type: RunnerMessageType.INPUT,
        data: `${line}\n`
      }
      ws.send(JSON.stringify(inputMsg))
      currentInputBuffer = ''
      cursorPosition = 0
      lastComposedText = ''
    }
  }

  const handleTextInput = (text: string) => {
    if (cursorPosition === currentInputBuffer.length) {
      // 커서가 끝에 있는 경우 단순 추가
      terminal.write(text)
      currentInputBuffer += text
      cursorPosition += text.length
    } else {
      // 커서가 끝에 있지 않은 경우에는 삽입 모드 사용
      terminal.write('\x1b[4h') // 삽입 모드 활성화
      terminal.write(text)
      terminal.write('\x1b[4l') // 삽입 모드 비활성화

      // Input 버퍼 업데이트
      currentInputBuffer =
        currentInputBuffer.substring(0, cursorPosition) +
        text +
        currentInputBuffer.substring(cursorPosition)
      cursorPosition += text.length
    }
  }

  const handleBackspaceInput = () => {
    if (cursorPosition === 0) {
      return
    }

    // 지울 문자 확인
    const charToDelete = currentInputBuffer[cursorPosition - 1]

    const isFullWidth = isFullWidthCharacter(charToDelete)

    if (cursorPosition === currentInputBuffer.length) {
      // 커서가 끝에 있는 경우
      if (isFullWidth) {
        terminal.write('\b \b\b \b') // 한글/전각은 두 칸 지우기
      } else {
        terminal.write('\b \b') // 일반 문자는 한 칸 지우기
      }
    } else {
      terminal.write('\b') // 한 칸 왼쪽으로 이동
      const deleteCount = isFullWidth ? 2 : 1
      terminal.write(`\x1b[${deleteCount}P`) // 해당 문자 삭제
    }

    // 버퍼 업데이트
    currentInputBuffer =
      currentInputBuffer.substring(0, cursorPosition - 1) +
      currentInputBuffer.substring(cursorPosition)
    cursorPosition--
  }

  const handlePasteWithLineBreaks = (data: string) => {
    const lines = data.split(/\r\n|\r|\n/)

    // Send every complete line, including empty lines. Input need not produce output.
    for (const line of lines.slice(0, -1)) {
      handleTextInput(line)
      terminal.writeln('')
      processLine(currentInputBuffer)
    }
    handleTextInput(lines.at(-1) ?? '')
  }

  const setupIMEHandlers = () => {
    // IME 조합 시작
    terminal.textarea?.addEventListener(
      'compositionstart',
      (e: CompositionEvent) => {
        if (!isConnected) {
          e.preventDefault()
          return
        }
        isComposing = true
      }
    )

    // IME 조합 완료
    terminal.textarea?.addEventListener(
      'compositionend',
      (e: CompositionEvent) => {
        if (!isConnected) {
          e.preventDefault()
          return
        }

        const composedText = e.data
        lastComposedText = composedText

        handleTextInput(composedText)
        isComposing = false
      }
    )
  }
  setupIMEHandlers()

  const setupWebSocketHandlers = () => {
    ws.onopen = () => {
      terminal.writeln(
        '[SYS] Local runner ready. Ctrl+C to stop, Ctrl+D to send EOF.\n'
      )
      terminal.focus()
      isConnected = true

      const compileMsg = compileMessageGenerator(source, language)
      ws.send(JSON.stringify(compileMsg))
    }

    ws.onclose = () => {
      terminal.writeln('\n[SYS] Connection to the runner closed')
      isConnected = false
      onFinished()
    }

    ws.onerror = () => {
      terminal.writeln('[SYS] Error occurred, connection closed')
      isConnected = false
      onFinished()
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const msgType = data.type

        switch (msgType) {
          case RunnerMessageType.COMPILE_ERR:
            terminal.writeln(data.stderr)
            break
          case RunnerMessageType.ECHO:
            break
          case RunnerMessageType.STDOUT:
          case RunnerMessageType.STDERR:
            outputLength += (data.data || '').length
            terminal.write(data.data || '')

            // 출력 길이가 100000자를 초과하면 연결 종료
            if (outputLength > 100000) {
              terminal.writeln(
                '\n\n[SYS] Output is too long, process terminated (Max 100000 characters)'
              )
              sendExitMessage()
            }
            break
          case RunnerMessageType.EXIT:
            terminal.writeln(
              `\n\n[SYS] Process ended with exit code: ${data.return_code}`
            )
            break
          case RunnerMessageType.ERROR:
            terminal.writeln(`[SYS] ${data.error}`)
            break
          default:
            return
        }

      } catch (e) {
        terminal.writeln(`[Error] ${e}`)
      }
    }
  }
  setupWebSocketHandlers()

  const handleDataInput = (data: string) => {
    if (!isConnected) {
      return
    }

    // Ctrl+C 입력 감지
    if (data === '\x03') {
      sendExitMessage()
      return
    }

    if (data === '\x04') {
      if (currentInputBuffer) processLine(currentInputBuffer)
      ws.closeStdin()
      isConnected = false
      return
    }

    // IME 조합 중이거나 직전 완성된 한글 중복 입력 방지
    if (isComposing || lastComposedText === data) {
      lastComposedText = ''
      return
    }

    // 줄바꿈이 있는 붙여넣기 처리
    if (data.includes('\r') || data.includes('\n')) {
      handlePasteWithLineBreaks(data)
      return
    }

    // 백스페이스 처리
    if (data === '\b' || data === '\x7f') {
      handleBackspaceInput()
      return
    }

    // 왼쪽 화살표 키 처리
    if (data === '\x1b[D') {
      if (cursorPosition > 0) {
        // 현재 커서 위치 직전의 문자 확인
        const prevChar = currentInputBuffer[cursorPosition - 1]

        const isFullWidth = isFullWidthCharacter(prevChar)
        cursorPosition--

        // 표준 왼쪽 이동 적용
        terminal.write(data)

        // 한글/전각 문자인 경우 한 번 더 이동 (CUB - Cursor Back)
        if (isFullWidth) {
          terminal.write(data)
        }
      }
      return
    }

    // 오른쪽 화살표 키 처리
    if (data === '\x1b[C') {
      if (cursorPosition < currentInputBuffer.length) {
        // 현재 커서 위치의 문자 확인
        const currChar = currentInputBuffer[cursorPosition]

        const isFullWidth = isFullWidthCharacter(currChar)
        cursorPosition++

        // 표준 오른쪽 이동 적용
        terminal.write(data)

        // 한글/전각 문자인 경우 한 번 더 이동 (CUF - Cursor Forward)
        if (isFullWidth) {
          terminal.write(data)
        }
      }
      return
    }

    // 일반 텍스트 입력 처리
    if (!data.startsWith('\x1b') && !/[\x00-\x1f\x7f]/.test(data)) {
      handleTextInput(data)
    }
  }
  const inputSubscription = terminal.onData(handleDataInput)

  return { ws, dispose: () => {
    inputSubscription.dispose()
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
    ws.close()
  } }
}

export const useRunner = () => {
  const [running, setRunning] = useState(false)
  const cleanup = useRef<(() => void) | undefined>(undefined)
  const generation = useRef(0)

  useEffect(() => () => {
    generation.current++
    cleanup.current?.()
  }, [])

  const startRunner = async (code: string, language: Language) => {
    const current = ++generation.current
    cleanup.current?.()
    cleanup.current = undefined
    setRunning(true)
    try {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'), import('@xterm/addon-fit')
      ])
      if (current !== generation.current) return
      const element = document.getElementById('runner-container')
      if (!element) throw new Error('Runner panel is not mounted')
      element.innerHTML = ''
      const terminal = new Terminal({
        convertEol: true, cursorBlink: true, theme: { background: '#121728' }
      })
      const fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.open(element)
      const fitTerminal = () => { if (element.clientWidth && element.clientHeight) fitAddon.fit() }
      const observer = new ResizeObserver(fitTerminal)
      observer.observe(element)
      cleanup.current = () => { observer.disconnect(); terminal.dispose() }
      fitTerminal()
      terminal.focus()
      const connection = connectRunner(terminal, code, language, () => {
        if (current === generation.current) setRunning(false)
      })
      cleanup.current = () => {
        connection.dispose()
        observer.disconnect()
        terminal.dispose()
      }
    } catch (error) {
      cleanup.current?.()
      cleanup.current = undefined
      setRunning(false)
      throw error
    }
  }

  return { startRunner, running }
}
