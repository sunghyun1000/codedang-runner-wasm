# Java backend

Java 소스는 CheerpJ 4.3 / Java 17에서 ECJ 3.38.0으로 컴파일한다.
진입점은 패키지 없는 `Main.main(String[])`이다.

Java 언어 설정·manifest·Bridge 소스·라이선스는 이 디렉터리에 모아둔다.
Bridge 소스는 `bridge/Bridge.java`, CheerpJ Worker와 생성된 Bridge JAR는
`src/backends/java/`, 다운로드 자산은 `.toolchains/java/`에 위치한다.

ECJ 3.38.0의 JAR manifest는 `JavaSE-17`을 요구하며 클래스 파일 버전도 61이다.
최신 ECJ를 자동으로 추적하지 않고 이 버전과 크기·SHA-256을 고정한다.

## 자산 준비

`npm run prepare:toolchains`는 Maven Central에서 ECJ와 대응 소스를 다운로드·검증한다.
검증된 로컬 파일이 있으면 재사용하며, JAR는 Git에 포함하지 않는다.
`npm run build`, `npm run dev:playground`에서도 자동으로 준비한다.

- `src/languages/java/toolchain.json`: 브라우저 자산 경로·크기·SHA-256
- `src/languages/java/distribution.json`: Maven 원본 URL·소스 JAR 검증 정보
- `.toolchains/java/ecj/3.38.0/<sha256>/`: compiler, sources, LICENSE, NOTICE

브라우저는 Maven에 직접 접속하지 않고 `assetBaseUrl`에서 컴파일러를 가져온다.
크기·해시 검증 및 Cache Storage 정책은 WASI와 동일하다.

### CheerpJ 런타임 캐시

`ToolchainLoader.runtimeFetch()`는 CheerpJ Worker에서 초기화 전에 설치된다.
CheerpJ의 fetch 기반 런타임 요청을 loader URL의 디렉터리 범위에서만 관리하며,
`modules` 등 동일한 URL·Range 응답을 `codedang-cheerpj-runtime-v1` Cache Storage에 저장한다.
컴파일 Worker가 종료되어도 실행 Worker와 이후 실행에서 같은 구간을 재사용한다.
206 응답은 내부적으로 200 응답으로 저장한 뒤 원래 상태·Content-Range·URL을 복원한다.
캐시 쓰기가 완료된 뒤 응답을 전달하여 Worker 종료로 저장이 중단되는 것을 피한다.

`createLocalRunnerConnection({ cache: false })`로 런타임 캐시도 끌 수 있다.
백엔드를 직접 등록할 때는 `createCheerpJBackend(javaOptions, loaderOptions)`의 두 번째
인자로 캐시 설정과 응답별 `maxAssetBytes`를 전달한다. 저장소 사용 불가·용량 초과 시에는
원래 네트워크 응답으로 계속 실행한다.

`ToolchainPrefetcher`는 `src/toolchains/cheerpj-manifest.ts`의 크기·SHA-256으로
콘솔 실행용 런타임 자산과 Java 17 `modules` 전체를 검증해 `codedang-toolchains-v1`에 저장한다.
Worker는 전체 파일 캐시가 있으면 해시를 검증한 뒤 필요한 구간을 잘라 206 응답으로 제공한다.
같은 Worker에서는 검증된 전체 파일을 메모리에서 재사용한다. 전체 파일이 없으면 기존
Range 캐시·네트워크로 대체한다. 알려진 자산의 Range 키에도 manifest 해시를 포함한다.
JVM 재사용이나 서로 다른 부분 응답의 병합은 하지 않는다.

JS import/importScripts 및 XMLHttpRequest는 기존 브라우저 HTTP 캐시를 사용한다.
GUI·폰트 등 manifest 밖의 추가 리소스까지 포함하는 완전한 오프라인 실행은 보장하지 않는다.
다른 loader URL은 고정된 CheerpJ 4.3 자산의 미러여야 하며 버전 변경 시 manifest 갱신이 필요하다.
브라우저는 저장한 캐시를 삭제할 수 있다.

```ts
createLocalRunnerConnection({
  assetBaseUrl: 'https://assets.example.com/toolchains/',
  java: { loaderUrl: 'https://cjrtnc.leaningtech.com/4.3/loader.js' },
})
```

## S3 게시

`.github/workflows/publish-java-toolchain.yml`은 수동 실행용 workflow다.
GitHub Environment `toolchains`에 다음 변수를 설정하고 AWS의 OIDC trust/IAM 권한을 구성한다.

- `TOOLCHAIN_AWS_ROLE_ARN`
- `TOOLCHAIN_AWS_REGION`
- `TOOLCHAIN_BUCKET`

AWS CLI가 설치되고 인증된 환경에서는 `TOOLCHAIN_BUCKET=... npm run publish:java-toolchain`도 가능하다.
기본 S3 prefix는 `toolchains`이며 `TOOLCHAIN_PREFIX`로 변경할 수 있다.

게시 스크립트는 존재하는 객체의 크기와 S3 SHA-256 체크섬을 확인한다.
누락된 객체만 조건부 업로드하고, 기존 객체가 다르면 실패한다.
버전·해시별 불변 경로에 1년 캐시를 적용하며 컴파일러와 대응 소스·라이선스 고지를 함께 게시한다.
S3/CDN에서 이 prefix를 `assetBaseUrl`로 제공해야 한다.
S3 인증 실패는 자산 누락으로 취급하지 않는다. 실제 업로드에는 별도의 AWS 설정이 필요하다.

## Bridge

자체 작성한 `Bridge.java`가 stdin/stdout/stderr와 컴파일 결과를 연결한다.
ECJ 기본 파일 관리자는 CheerpJ에 없는 전체 JDK/JRT 파일을 요구하므로,
ECJ 컴파일 API에 CheerpJ가 제공하는 클래스 리소스를 연결한다.
OpenJDK 컴파일러·표준 라이브러리 바이너리를 별도로 추출하거나 포함하지 않는다.

컴파일 결과는 메모리에서 JAR로 묶어 다음 실행 Worker에 전달한다.
ECJ 의존 코드는 별도 내부 클래스에 격리하여 실행 Worker에는 ECJ가 필요하지 않다.
컴파일·실행마다 새 Worker를 사용하고 중단·시간/출력 제한 시 Worker를 종료한다.

생성된 `bridge.generated.ts`는 저장소에 포함되어 있어 일반 빌드에는 JDK가 필요 없다.
Bridge를 변경할 때만 Java 17+ JDK로 재생성한다.

```sh
JAVA_HOME=/path/to/jdk-17 npm run build:java
```

이는 프로젝트 자체 Bridge만 컴파일하며 JDK에서 컴파일러를 추출하지 않는다.
ECJ는 EPL-2.0이며 `LICENSE`와 `NOTICE`를 참고한다. CheerpJ의 라이선스는 별개다.

## 브라우저 환경

WASI와 함께 사용하려면 기존 COOP/COEP 헤더가 필요하다.
CSP에서는 blob Worker, ES module Worker 자산, CheerpJ 공식 CDN 다운로드를 허용해야 한다.
CheerpJ 라이선스는 https://cheerpj.com/docs/licensing 를 따른다.
