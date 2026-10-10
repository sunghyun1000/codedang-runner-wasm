# Java 러너

## 컴파일러와 실행 엔진

Java는 **브라우저 javac → 바이트코드 → TeaVM → WasmGC** 순서로 처리합니다.
결과 프로그램을 실행할 때 JVM이나 Runno는 사용하지 않습니다.

`compiler.wasm`은 javac와 TeaVM 컴파일러를 함께 담은 모듈입니다.
공식 `konsoletyper/teavm-javac` 소스를 수정 없이 직접 빌드했습니다.

- 고정 커밋: `208d4c97a602ba0df055f16e6882059fb69d0122`
- TeaVM 의존성: 0.16.0
- 빌드 스크립트: [build-teavm-javac.mjs](../scripts/build-teavm-javac.mjs)
- 자산 버전·크기·해시: [toolchain.json](../src/languages/java/toolchain.json)

## 코드 흐름

```text
javaAdapter.prepare(source)
  → Java 백엔드 action: compile (컴파일 Worker)
    → SDK와 호환 오버레이 등록
    → Main.java + CodedangBootstrap.java 컴파일
    → 바이트코드의 System.in 참조 연결
    → /program.wasm 생성
  → Java 백엔드 action: run (새 실행 Worker)
    → 순정 TeaVM 로더로 WasmGC 실행
```

컴파일과 실행은 각각 새 Worker를 사용합니다. 컴파일러 인스턴스는 제출 간 재사용하지 않습니다.
사용자 진입점은 패키지 없는 `Main.main(String[])`입니다.

| 파일 | 역할 |
| --- | --- |
| [languages/java/index.ts](../src/languages/java/index.ts) | 컴파일 요청과 실행용 Program 구성 |
| [backends/java/teavm.ts](../src/backends/java/teavm.ts) | Worker 생성·입력 전송·취소·결과 수신 |
| [backends/java/worker.ts](../src/backends/java/worker.ts) | 컴파일 API 호출, WasmGC 실행, 입출력 연결 |
| [bootstrap.ts](../src/languages/java/bootstrap.ts) | 사용자 코드와 함께 컴파일할 입력 래퍼 |
| [redirect-stdin.ts](../src/languages/java/redirect-stdin.ts) | `.class`의 `System.in` 필드 참조만 변환 |
| [sdk-overlay.ts](../src/languages/java/sdk-overlay.ts) | upstream annotation SDK 오류 보정 |

사용자 소스의 문자열·주석을 치환하지 않습니다. javac가 해석한
`java.lang.System.in` 참조만 `CodedangBootstrap.in`으로 연결합니다.

## 실시간 stdin과 출력

호스트와 실행 Worker는 공유 버퍼 하나로 입력을 주고받습니다.
첫 4바이트는 상태, 나머지 8192바이트는 입력 데이터입니다.

| 상태 | 의미 |
| --- | --- |
| `0` | 입력 없음; Worker가 `Atomics.wait()`로 대기 |
| 양수 | 읽을 입력 바이트 수 |
| `-1` | EOF |

호스트가 데이터를 쓰고 `Atomics.notify()`하면 Worker가 다시 읽습니다.
대기는 실행 Worker만 멈추므로 에디터는 계속 동작합니다. 이 입력 연결에는 JSPI가 필요하지 않습니다.

출력은 순정 로더의 `installImports`로 `teavmConsole`에 연결합니다.
줄바꿈·버퍼 크기 기준으로 묶어 전송하고, 입력 대기 전에는 줄바꿈 없는 프롬프트도 비웁니다.

## Scanner와 Reader 호환 오버레이

upstream 소스·배포 파일을 변경하지 않고 별도 클래스 정의를 공급합니다.

- `scanner-sdk.bin`: javac가 읽는 `java.util.Scanner` API
- `scanner-runtime.bin`: TeaVM이 읽는 `TScanner`와 예외 구현
- `runtime-compat.bin`: NIO 호환 문제를 우회하는 `TInputStreamReader`

소스는 [scripts/java/](../scripts/java/)에 있습니다.
SDK는 `setSdk()`, 실제 구현은 `setTeaVMClasslib()`로 추가합니다.
기존 TeaVM 클래스 매핑 규칙이 `java.util.Scanner`를 `TScanner`에 연결합니다.

Scanner는 일반 콘솔용 토큰·줄·숫자·lookahead·EOF를 지원하지만 전체 JDK API는 아닙니다.
파일·채널 생성자, 검색·스트림 API, 모든 locale·charset 동작은 보장하지 않습니다.
정확한 범위는 [Java 상세 문서](../src/languages/java/README.md)를 참고하세요.
JDK와의 동작 비교 코드는 [scanner-contract/Main.java](../tests/fixtures/java/scanner-contract/Main.java)입니다.
