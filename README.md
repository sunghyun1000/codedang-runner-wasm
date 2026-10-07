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
S3 게시 workflow와 Bridge 재생성은 [src/languages/java/README.md](src/languages/java/README.md)를 참고합니다.

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
