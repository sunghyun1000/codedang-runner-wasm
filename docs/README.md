# 프로젝트 구조 안내

이 프로젝트는 **사용자 코드를 서버에 보내지 않고 브라우저에서 컴파일·실행하는 러너**입니다.
서버는 정적 파일을 제공하는 역할만 맡으며, 문제 채점·제출·인증 기능은 포함하지 않습니다.

현재 main의 실행 엔진은 다음과 같습니다.

| 언어 식별자 | 코드 준비 | 실행 엔진 |
| --- | --- | --- |
| `C` | Clang 컴파일 + 링크 | Runno WASI |
| `Cpp` | Clang 컴파일 + 링크 | Runno WASI |
| `Python3` | 인터프리터와 소스 준비 | Runno WASI |
| `Java` | 브라우저 javac + TeaVM 컴파일 | TeaVM WasmGC |

Java는 Runno를 거치지 않습니다. 이전 CheerpJ/ECJ 구현은 제거되었습니다.

## 읽는 순서

1. [전체 구조](architecture.md): 폴더별 책임과 핵심 인터페이스
2. [실행 흐름과 프로토콜](execution.md): 연결, 컴파일, 입력, 종료
3. [Java 러너](java.md): 순정 컴파일러, 호환 오버레이, 실시간 stdin
4. [자산과 캐시](toolchains.md): 바이너리 위치, manifest, 정적 배포
5. [개발과 테스트](development.md): 실행 명령, 플레이그라운드, 수정 지점

## 먼저 볼 코드

- [src/index.ts](../src/index.ts): 외부에 공개하는 API
- [src/connection/index.ts](../src/connection/index.ts): 기본 언어·엔진을 연결하는 진입점
- [src/core/runner.ts](../src/core/runner.ts): 실행 생명주기 관리
- [src/core/types.ts](../src/core/types.ts): 언어와 엔진 사이의 공통 계약

문서는 설계의 길잡이입니다. 실제 지원 범위와 기본값을 바꿀 때는 코드·테스트와 함께 갱신하세요.
