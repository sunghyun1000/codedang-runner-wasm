# 실행 흐름과 프로토콜

## 한 번의 실행

[RunnerSession](../src/core/runner.ts)은 연결 하나당 한 프로그램만 실행합니다.
다시 실행할 때는 새 연결을 만듭니다.

```text
ready → preparing → compiling → running → finished
                       ↑ 생략 가능: Python 같은 해석형 언어
```

1. `code` 메시지를 받으면 언어 어댑터를 선택합니다.
2. `ToolchainLoader`로 툴체인을 읽어 가상 파일시스템을 구성합니다.
3. 어댑터의 `prepare()`가 컴파일 또는 인터프리터 준비를 수행합니다.
4. 컴파일이 필요한 언어는 `context.execute()`로 컴파일러를 실행합니다.
5. 반환된 `Program.backend`에 맞는 백엔드로 사용자 프로그램을 실행합니다.
6. 입력 큐를 실행 중인 프로그램에 연결하고, 출력을 이벤트로 전달합니다.
7. 완료·오류·취소 시 입력 큐를 닫고 `AbortController`로 실행을 정리합니다.

컴파일 중 출력은 진단으로 모았다가 전달합니다. 실행 중 출력처럼 즉시 터미널로
보내는 것은 아닙니다. 컴파일러의 종료 코드가 0이 아니면 `CompileError`로 처리합니다.

## 연결 API

[RunnerConnection](../src/connection/index.ts)은 WebSocket과 비슷한 모양이지만
**네트워크 연결을 만들지 않습니다**. `send()`는 로컬 세션으로 메시지를 전달합니다.

```ts
import { createLocalRunnerConnection } from '@codedang/browser-runner'

const connection = createLocalRunnerConnection({ assetBaseUrl: '/toolchains/' })
connection.onmessage = event => console.log(JSON.parse(event.data))
connection.onopen = () => {
  connection.send(JSON.stringify({
    type: 'code', language: 'Python3', source: 'print("Hello")'
  }))
}
```

열림·메시지·닫힘 콜백은 microtask로 전달됩니다. 연결을 만든 직후 콜백을 등록하면 됩니다.

## 메시지 종류

정의와 입력 검증은 [protocol.ts](../src/connection/protocol.ts)에 있습니다.

| 방향 | 타입 | 데이터 |
| --- | --- | --- |
| 앱 → 러너 | `code` | `language`, `source` |
| 앱 → 러너 | `input` | `data` (줄바꿈이 필요하면 직접 포함) |
| 앱 → 러너 | `exit` | 사용자 취소 요청 |
| 러너 → 앱 | `compile_success` / `compile_error` | `stdout` / `stderr` |
| 러너 → 앱 | `stdout` / `stderr` / `echo` | `data` |
| 러너 → 앱 | `exit` | `return_code`, 선택적 `error` |
| 러너 → 앱 | `error` | `error` |

EOF 메시지는 없습니다. 로컬 확장 메서드 **`closeStdin()`**으로 EOF를 보냅니다.
`close()`는 연결과 실행을 조용히 닫으며, `exit` 메시지는 취소 종료 코드 130을 전달합니다.

## 입력과 제한

[StdinQueue](../src/core/stdin-queue.ts)는 실행 준비 중의 입력도 보관합니다.
백엔드가 연결되면 입력을 순서대로 보내고, UTF-8 문자 경계를 지켜 청크를 나눕니다.
EOF는 대기 중인 입력을 모두 보낸 다음 전달됩니다.

- 기본 제한: 시간 **180초**, 출력 **100,000 UTF-8 바이트**, 대기 입력 큐 **1MiB**
- 시간 제한은 자산 준비·컴파일·사용자 입력 대기까지 포함합니다.
- 출력 제한은 컴파일 진단과 프로그램 출력을 함께 셉니다.
- 입력 제한은 전체 누적 입력이 아니라 **아직 전달되지 않은 큐 크기**입니다.
- 실행 메모리 전체를 제한하는 공통 기능은 없습니다.

컴파일 오류는 `compile_error`, 시간·출력 제한 등의 실패는 `error`로 종료됩니다.
모든 종료 경로에서 `exit` 이벤트가 오는 것은 아니므로, UI 정리는 `onclose`도 처리해야 합니다.
