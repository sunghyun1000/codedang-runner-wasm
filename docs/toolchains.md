# 바이너리 자산과 캐시

## 세 위치를 구분하기

| 위치 | 내용 | 관리 방식 |
| --- | --- | --- |
| `.toolchains/` | 로컬 컴파일러·인터프리터·클래스 라이브러리 | Git 제외, 준비·빌드 스크립트로 생성 |
| `src/languages/*toolchain*.json` 등 | 자산 경로·크기·SHA-256 선언 | Git으로 버전 관리 |
| 브라우저 Cache Storage | 다운로드한 검증 자산 | 실행 시 로더가 조회·저장 |

`dist/`는 이 라이브러리의 빌드 결과이며, 툴체인 저장 폴더가 아닙니다.

## 로컬 폴더

```text
.toolchains/
  runno/                    clang.wasm, wasm-ld.wasm, Python WASM, tar.gz 자산
  java/teavm-javac/
    compiler.wasm           javac + TeaVM 컴파일러
    compiler.wasm-runtime.js 순정 로더
    compile-classlib-teavm.bin / runtime-classlib-teavm.bin
    runtime-compat.bin      Reader 호환 구현
    scanner-sdk.bin / scanner-runtime.bin
    build-source/           고정 upstream 소스와 빌드 결과
    overlay-build/          프로젝트 호환 클래스 빌드 결과
    PROVENANCE.json         빌드 출처
```

브라우저에는 manifest의 **7개 Java 실행 자산만** 필요합니다.
`build-source/`, 빌드 JDK, ZIP 등 개발 자료는 런타임 자산이 아닙니다.

## 준비와 로딩

- [prepare-toolchains.mjs](../scripts/prepare-toolchains.mjs): Runno 준비와 Java 자산 검증
- [prepare-runno-toolchains.mjs](../scripts/prepare-runno-toolchains.mjs): npm `@runno/sandbox`의 5개 자산 복사·검증
- [prepare-teavm-javac.mjs](../scripts/prepare-teavm-javac.mjs): 이미 빌드한 Java 자산의 크기·해시 검증
- [ToolchainLoader](../src/toolchains/loader.ts): 브라우저 다운로드·캐시 검증·가상 파일시스템 구성

Java 자산이 없으면 `build:java`를 먼저 실행해야 합니다.
`prepare:toolchains`가 Java 컴파일러를 자동으로 내려받거나 빌드하지는 않습니다.

로더는 캐시와 다운로드 결과 모두 **크기와 SHA-256**을 검사합니다.
캐시 키에는 해시를 붙이므로 새 자산과 이전 자산을 구분할 수 있습니다.
아카이브는 압축 상태로 캐시하고 `load()`할 때 해제합니다. `prefetch()`는 파일시스템을 만들지 않습니다.

기본 크기 제한은 자산당 128MiB, 툴체인 선언 크기 합계 512MiB이며,
아카이브 해제 시에도 크기·경로를 검사합니다.
캐시 장애는 일반 실행을 막지 않지만, 사전 캐시에서는 오류로 보고됩니다.
캐시는 바이너리 다운로드만 재사용하며 실행 중인 컴파일러나 프로그램 상태를 보관하지 않습니다.

## 사전 준비

[ToolchainPrefetcher](../src/toolchains/prefetcher.ts)는 **선택 언어 → 사용 가능 언어 → 나머지 언어** 순서로 준비합니다.
C/C++ 공용 manifest는 한 큐에서 한 번 처리합니다. 언어 선택을 바꾸면 대기 순서를 바꾸되
진행 중인 언어는 중단하지 않습니다. 페이지를 떠날 때는 `dispose()`로 중단합니다.

Cache Storage 사용에는 HTTPS 또는 localhost 같은 보안 컨텍스트가 필요합니다.
캐시 준비 완료가 완전한 오프라인 실행이나 빠른 컴파일 시간을 보장하지는 않습니다.

## 정적 배포

기본 `assetBaseUrl`은 `/toolchains/`입니다. Runno 파일은 그 아래에,
Java 파일은 `java/teavm-javac/` 아래에 manifest와 같은 상대 경로로 게시합니다.
직접 `ToolchainLoader`나 `RunnerSession`을 사용할 때는 상대 URL용 base를 명시하세요.

[playground/vite.config.ts](../playground/vite.config.ts)의 자산 미들웨어는 **개발 서버 전용**입니다.
프로덕션 빌드가 `.toolchains/`를 자동 포함하지 않으므로 S3/CDN 등에서 별도 제공해야 합니다.
교차 출처 자산은 CORS 및 COEP에 맞는 응답 헤더도 필요합니다.
바이너리를 재배포할 때는 라이선스 고지·대응 소스 제공 조건을 별도로 확인하세요.
