# Codedang editor playground

`npm run dev:playground`로 실행합니다. `npm run check:playground`로 타입 검사,
`npm run build:playground`로 UI 번들 빌드를 확인할 수 있습니다.
`npm run test:playground`로 에디터 UI, 실행, stdin/EOF, 중단·재실행을 확인합니다.
Java 테스트에는 CheerpJ 공식 CDN 접속이 필요합니다.
프로덕션 배포 시 `/runno/langs/`에 toolchain 자산을 별도로 제공하고 COOP/COEP 헤더를 설정해야 합니다.

## 원본 코드

- 저장소: https://github.com/skkuding/codedang
- 기준 commit: `a4a171b4ef5b92b11ea02e8d017f44d0bdd8ad62`
- 라이선스: MIT (`LICENSE.codedang`)
- 원본 경로 기준: `apps/frontend/`

`components/CodeEditor.tsx`, 필요한 `components/shadcn/*`,
`app/(client)/(code-editor)/_components/TestcasePanel/{RunnerTab.tsx,useRunner.ts,xterm.css}`와
`public/logos/codedang-editor.svg`를 가져왔습니다.

CodeMirror 테마, 구문 강조, 확대/축소, xterm 터미널 입력 로직은 원본 기반입니다.
아이콘은 동일 용도의 Lucide 아이콘으로 통일해 `react-icons` 전체 모듈을 번들링하지 않습니다.
`EditorLayout.tsx`와 `EditorHeader.tsx`는 원본 UI를 Vite 환경에 맞춰 축소한 버전입니다.
Next.js 인증·문제 조회·라우팅·제출·테스트 채점·저장 로직은 포함하지 않습니다.
Reset, Save, Test, Submit 및 Submissions는 비활성 UI만 남겼습니다.
언어별 소스는 페이지가 열려 있는 동안 별도로 유지됩니다.

## 로컬 실행 연결

`useRunner.ts`의 WebSocket 생성만 `createLocalRunnerConnection()`으로 교체하고
기존 `code`, `input`, `stdout`, `stderr`, `compile_error`, `exit` 프로토콜을 사용합니다.
터미널의 Ctrl+C는 실행 중단, Ctrl+D는 `closeStdin()`으로 EOF를 보냅니다.
Ctrl/Cmd+Enter로 실행할 수 있습니다.

원본의 출력 응답 대기 기반 입력 큐는 제거했습니다. 출력 없이 입력만 읽는 프로그램도
여러 줄·빈 줄을 받을 수 있습니다. 재실행·unmount 시 Worker 연결, 터미널 및
ResizeObserver를 정리하며, 실행 시간 제한(180초)은 로컬 러너에서 관리합니다.
