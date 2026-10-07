# Codedang WASM Runner

Codedang의 기존 코드 러너를 브라우저에서 실행할 수 있도록 WASM 기반으로 재구현하기 위한 테스트 저장소입니다. 


WASM 프로그램 실행에는 Runno의 WASI 구현을 활용합니다.

Runno는 Git subtree 대신 npm 의존성으로 사용합니다.

| 용도 | 패키지 | 분류 |
| --- | --- | --- |
| 브라우저 WASI 실행 | `@runno/wasi@0.10.0` | `dependencies` |
| C/C++·Python 툴체인 자산 공급 | `@runno/sandbox@0.10.2` | `devDependencies` |

버전은 `package.json`과 `package-lock.json`에 고정합니다. Sandbox 실행 코드는
브라우저에 import하지 않고, 패키지에 포함된 자산만 준비 단계에서 사용합니다.

## 설치 및 툴체인 자산

```sh
npm ci
npm run prepare:toolchains
```

Node.js 22 이상을 권장합니다. 준비 스크립트는 npm 패키지에서 필요한 파일 5개만
`.toolchains/runno/`로 복사합니다. 이 폴더와 `node_modules/`는 Git에 포함하지 않습니다.
`src/languages/toolchains.json`의 크기·SHA-256으로 검증하며 불일치하면 실패합니다.
브라우저의 툴체인 로더도 동일한 manifest를 사용합니다.

`npm run build`, `npm run dev:playground`, `npm run build:playground`는
자산 준비를 자동으로 먼저 실행합니다. CI 빌드 단계에서는 개발 의존성까지 설치해야 합니다.

배포 시 `.toolchains/runno/`의 자산을 `assetBaseUrl` 아래에 게시합니다.
플레이그라운드는 WASI·Java 공용 자산 URL인 `/toolchains/`를 사용합니다.
이 기본 경로는 `src/config.ts`의 연결 설정에만 정의합니다.
`ToolchainLoader` 또는 `RunnerSession`을 직접 사용하는 경우에는 상대 자산 URL에 대해
`assetBaseUrl`을 명시해야 합니다. 절대 자산 URL은 base 없이도 사용할 수 있습니다.
Runno의 LICENSE는 `RUNNO-LICENSE`로 함께 복사하지만, 각 컴파일러·인터프리터 자산의
라이선스 및 소스 제공 조건은 별도로 확인해야 합니다.

Java 컴파일러는 ECJ 3.38.0을 사용합니다. 준비 단계에서 Maven Central의 고정된 JAR와
대응 소스를 검증해 `.toolchains/java/`에 저장합니다. 배포 시 이 폴더의 파일도
`assetBaseUrl` 아래에 같은 상대 경로로 게시합니다.
CheerpJ의 fetch 기반 런타임 자산도 `ToolchainLoader`가 관리합니다. 동일 URL·Range 응답은
별도 Cache Storage에 보관하여 컴파일·실행 Worker와 이후 실행에서 재사용합니다.
`ToolchainPrefetcher`로 Java 17 표준 라이브러리 전체를 사전 캐시하면 Range 요청도
그 파일에서 제공합니다. `cache: false`로 실행 중 캐시를 비활성화할 수 있습니다.
S3 게시 workflow와 Bridge 재생성은 [src/languages/java/README.md](src/languages/java/README.md)를 참고합니다.

## 브라우저 자산 사전 캐시 API

```ts
import { ToolchainPrefetcher } from '@codedang/browser-runner'

const prefetcher = new ToolchainPrefetcher({ assetBaseUrl: '/toolchains/' })

// await하지 않아도 다운로드는 백그라운드에서 진행됩니다.
const result = await prefetcher.prefetch({
  selectedLanguage: 'Java',
  availableLanguages: ['C', 'Cpp', 'Java', 'Python3']
})
console.log(result.completed, result.errors)

// 언어 변경 시 같은 인스턴스로 다시 호출하면 대기 중인 언어 순서를 변경합니다.
// 페이지를 떠날 때는 prefetcher.dispose()로 중단합니다.
```

선택 언어 → 사용 가능한 언어 → 나머지 내장 언어 순으로 순차 다운로드합니다.
진행 중인 언어는 완료한 뒤 다음 우선순위를 적용하며, C/C++ 공용 자산은 한 번만 준비합니다.
아카이브는 압축 상태로 저장하고 실행할 때 해제합니다. 캐시의 실제 크기·SHA-256이
manifest와 같으면 유지하고, 없거나 손상되었거나 manifest 해시가 바뀌면 다시 다운로드합니다.
다운로드 결과도 검증하며, 일치하지 않는 파일은 저장하지 않습니다.

CheerpJ 자산 목록·해시는 `src/toolchains/cheerpj-manifest.ts`에 고정합니다.
다른 버전으로 갱신할 때는 이 manifest도 함께 갱신해야 합니다. 전체 Java 17 표준 라이브러리는
약 36.4 MiB이며 모든 내장 언어를 처음 준비하면 약 118 MiB를 다운로드합니다.
GUI·폰트 등 콘솔 실행 manifest 밖의 CheerpJ 리소스는 필요 시 기존 네트워크 경로를 사용합니다.
JS import/importScripts와 XMLHttpRequest는 브라우저 HTTP 캐시를 사용하므로 완전한 오프라인
실행을 보장하는 API는 아닙니다.

사전 준비는 Cache Storage 사용 가능한 보안 컨텍스트(HTTPS 또는 localhost)가 필요합니다.
저장 공간 부족 등은 `result.errors`에 반환하고 다른 언어 준비는 계속합니다.
`onStatus` 콜백으로 언어별 `preparing`, `ready`, `error` 상태를 받을 수 있습니다.
플레이그라운드는 이 API를 언어 선택과 연결하고 선택 언어의 준비 중에는 Run을 비활성화합니다.
기존 실행 API는 캐시 실패 시에도
네트워크에서 실행 자산을 받아 사용할 수 있습니다.

## 버전 갱신 및 검증

WASI 실행 패키지와 툴체인 공급 패키지는 독립적으로 버전을 고정합니다.
자산을 변경할 때만 manifest의 크기·해시를 검토해 갱신합니다.

```sh
npm test
npm run test:browser
npm run test:playground
```

Git subtree 파일은 제거되었지만, 이전 커밋의 바이너리 이력까지 삭제되지는 않습니다.


Playground를 통해 사용해볼 수 있습니다.

프로젝트 root에서 npm run dev:playground 실행 후, 표시되는 주소로 접속하십시오.
