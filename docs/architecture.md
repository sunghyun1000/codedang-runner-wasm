# 전체 구조

## 폴더별 역할

```text
src/
  connection/       WebSocket과 비슷한 로컬 연결 API, 메시지 파싱
  core/             실행 세션, 입력 큐, 공통 타입·오류
  languages/        언어별 컴파일·준비 절차, 툴체인 manifest
  backends/wasi/    Runno WASI 실행
  backends/java/    TeaVM 컴파일·실행 Worker와 호스트
  toolchains/       자산 다운로드·검증·캐시·사전 준비
  config.ts         기본 자산 URL
  index.ts          공개 API
playground/         React 에디터와 터미널 데모
scripts/            로컬 자산 준비, Java 빌드, 스크립트 테스트
tests/              러너 테스트, 브라우저 테스트, Java 비교용 코드
.toolchains/        로컬 바이너리·빌드 자료 (Git 제외)
dist/               라이브러리 빌드 결과 (Git 제외)
docs/               이 구조 안내
```

## 의존 관계

```text
에디터 또는 외부 앱
    ↓
RunnerConnection → RunnerSession
                       ├─ ToolchainLoader: 필요한 자산 → 가상 파일시스템
                       ├─ LanguageAdapter: 소스 → 실행할 Program
                       └─ Backend: Program 실행 → 입출력·실행 결과
```

`connection`은 기본 언어·백엔드를 등록하는 조립 지점입니다.
`core`는 Java나 Runno의 구현을 직접 알지 않고, 옵션으로 받은 인터페이스를 사용합니다.
`languages`에는 컴파일 명령과 언어별 절차를, `backends`에는 실제 엔진 제어를 둡니다.

## 핵심 인터페이스

[src/core/types.ts](../src/core/types.ts)에 정의되어 있습니다.

| 타입 | 책임 |
| --- | --- |
| `LanguageAdapter` | `prepare(source, context)`로 실행할 프로그램 준비 |
| `Program` | `{ backend, payload }`; 엔진 선택 이름과 엔진 전용 데이터 |
| `Backend` | `start(payload, output, signal)`로 실행 시작 |
| `RunningProgram` | `write`, `eof`, `result`로 입력·EOF·완료 제어 |
| `ExecutionResult` | 종료 코드와 실행 후 파일시스템 반환 |
| `FileSystem` | 경로별 문자열 또는 바이너리 파일을 담는 객체 |

파일시스템은 호스트 PC의 디스크가 아닙니다. 컴파일러의 입력 파일, 툴체인,
생성된 `.wasm` 등을 메모리에서 주고받기 위한 표현입니다.

## 확장할 때

- 같은 엔진에서 새 언어를 실행한다면 **어댑터**를 추가합니다.
- 다른 런타임을 쓰려면 **백엔드**를 추가합니다.
- 컴파일러 실행도 `context.execute()`를 이용해 기존 백엔드로 처리합니다.
- `createLocalRunnerConnection({ languages, backends })`의 옵션으로 기본 등록을 덮어쓸 수 있습니다.
- `RunnerSession`을 직접 만들면 언어·백엔드 등록도 직접 제공해야 합니다.

새 엔진마다 연결 프로토콜이나 제한 로직을 복제하지 않는 것이 이 구조의 핵심입니다.
