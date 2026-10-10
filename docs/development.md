# 개발·플레이그라운드·테스트

## 로컬 실행

Node.js 22 이상을 사용합니다. Java 자산을 새로 빌드할 때는 JDK 25가 필요합니다.

```sh
npm ci
JAVA_HOME=/path/to/jdk-25 npm run build:java  # Java 자산이 없는 경우 또는 재생성 시
npm run dev:playground
```

`build:java`는 공식 소스를 고정 커밋으로 받아 빌드하고 호환 오버레이를 따로 생성합니다.
이미 있는 upstream checkout이 다른 커밋이거나 수정되어 있으면 자동 덮어쓰지 않고 실패합니다.
바이너리가 준비된 뒤에는 에디터 실행과 일반 번들 빌드에 JDK가 필요하지 않습니다.
빌드 도구의 Node API 지원 여부에 따라 최신 Node 22 또는 그 이후 버전을 사용하세요.

`dev:playground`, `build`, `build:playground`는 실행 전에 자산 준비·검증을 자동 수행합니다.
자산을 변경하면 [manifest](../src/languages/java/toolchain.json)의 크기·해시도 검토해 갱신해야 합니다.

## 플레이그라운드 연결

| 파일 | 역할 |
| --- | --- |
| [EditorLayout.tsx](../playground/src/components/EditorLayout.tsx) | 언어별 소스 유지, 사전 캐시 상태, Run 제어 |
| [CodeEditor.tsx](../playground/src/components/CodeEditor.tsx) | CodeMirror 편집·언어 강조 |
| [useRunner.ts](../playground/src/components/TestcasePanel/useRunner.ts) | 로컬 연결과 xterm 터미널 연결 |
| [vite.config.ts](../playground/vite.config.ts) | 개발 자산 서빙, COOP/COEP 헤더 |

터미널 입력은 Enter로 전송하고, 여러 줄 붙여넣기는 줄별 `input` 메시지로 보냅니다.
Ctrl+C는 중단, Ctrl+D는 EOF, Ctrl/Cmd+Enter는 새 실행입니다.
터미널이 입력을 직접 표시하므로 러너의 `echo` 이벤트는 다시 출력하지 않습니다.
재실행·화면 해제 시 연결, 터미널, ResizeObserver를 정리합니다.

Reset·Save·Test·Submit은 서버 기능이 연결되지 않은 비활성 UI입니다.
이 데모는 로컬 실행만 제공하며, 실제 문제 채점 시스템이 아닙니다.

## 검사 명령

| 명령 | 검증 대상 |
| --- | --- |
| `npm run check` | 라이브러리 TypeScript |
| `npm run check:playground` | UI TypeScript |
| `npm test` | Vitest 단위 테스트 + Node 스크립트 테스트 |
| `npm run test:browser` | 라이브러리 빌드 후 실제 WASI Worker 테스트 |
| `npm run test:playground` | UI·언어 실행·실시간 입출력 E2E |
| `npm run build` | `dist/`에 라이브러리와 타입 선언 생성 |
| `npm run build:playground` | `playground/dist/`에 UI 생성 |

Node 스크립트 테스트 중 Scanner의 JVM 비교는 JDK가 없으면 건너뜁니다.
플레이그라운드 Scanner 비교 테스트는 기준 출력 생성에 JDK가 필요합니다.
**사용자 브라우저에서 Java를 실행할 때 JDK가 필요한 것은 아닙니다.**

## 변경할 코드 찾기

| 수정할 내용 | 시작할 위치 |
| --- | --- |
| 메시지 형식·입력 검증 | `src/connection/protocol.ts` |
| 시간·출력 제한, 종료 처리 | `src/core/runner.ts` |
| 입력 큐·UTF-8 청크 처리 | `src/core/stdin-queue.ts` |
| C/C++ 컴파일 옵션 | `src/languages/c/`, `src/languages/cpp/` |
| Python 인자·환경 | `src/languages/python3/` |
| Java 컴파일·실행 | `src/backends/java/`, `src/languages/java/` |
| Scanner·Reader 호환성 | `scripts/java/`, `scripts/scanner.test.mjs` |
| 자산 출처·검증·캐시 | `scripts/prepare-*.mjs`, `src/toolchains/` |

입출력이나 라이브러리 호환성을 바꾸면 **실제 브라우저 테스트까지** 실행하세요.
특히 Scanner는 같은 Java 코드를 JDK와 TeaVM에서 실행해 비교하는 테스트를 유지해야 합니다.
새 테스트가 Git에 포함됐는지도 확인하세요. 현재 `.gitignore`의 `/tests/` 규칙 때문에
기존 추적 파일과 달리 새 파일은 명시적 추가가 필요할 수 있습니다.

## 배포 전 확인

- `SharedArrayBuffer`를 위해 COOP `same-origin`, COEP `require-corp` 설정
- Java 실행 대상 브라우저의 WasmGC 지원 확인
- CSP에서 Worker·blob 모듈과 TeaVM의 동적 JS interop 허용 여부 확인
- 번들뿐 아니라 manifest에 선언한 정적 자산도 배포
- 시간·출력 제한이 실행 메모리 제한이나 결과의 신뢰성을 보장한다고 가정하지 않기
