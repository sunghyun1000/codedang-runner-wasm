# Java backend

Java 소스는 브라우저의 CheerpJ 4.3 / Java 17에서 컴파일하고 실행한다.
CheerpJ는 공식 CDN 로더를 사용하고, 별도로 배포하는 `javac-17.jar`는
OpenJDK의 `jdk.compiler` 모듈이다. 진입점은 패키지 없는 `Main.main(String[])`이다.

```ts
createLocalRunnerConnection({
  assetBaseUrl: 'https://assets.example.com/toolchains/',
  java: {
    loaderUrl: 'https://cjrtnc.leaningtech.com/4.3/loader.js',
    // licenseKey: '...',
  },
})
```

`java/assets/javac-17.jar`를 다른 언어 자산과 같은 `assetBaseUrl` 아래에 게시한다.
컴파일러는 manifest의 크기·SHA-256 검증 및 기존 Cache Storage 정책을 따른다.
CheerpJ JVM 자산은 공식 로더가 직접 내려받는다.
배포 시 `java/assets/`의 라이선스·NOTICE 파일도 함께 제공한다.

`Bridge.java`는 native 메서드로 stdin/stdout/stderr를 연결한다.
컴파일 결과는 메모리에서 JAR로 묶어 다음 실행 Worker에 전달한다.
컴파일과 실행은 각각 새 Worker를 사용하며 중단·시간/출력 제한 시 Worker를 종료한다.
`System.exit()`도 실제 JVM 종료 코드로 전달한다.

플레이그라운드는 `npm run dev:playground`로 실행한 뒤 Java를 선택하면 된다.
stdin에서 Ctrl+D를 누르면 EOF를 전달한다. 첫 실행은 JVM 자산 다운로드로 느릴 수 있다.

## 연결용 코드와 컴파일러 재생성

생성된 bridge 및 compiler manifest와 compiler JAR는 저장소에 포함되어 있어
일반 TypeScript 빌드에 JDK는 필요하지 않다. 갱신할 때는 OpenJDK 17 JDK를 사용한다.

```sh
JAVA_HOME=/path/to/jdk-17 npm run build:java
npm run build
```

기본 컴파일러는 Temurin 17.0.20.1의 `jdk.compiler`에서 추출했다.
원본 소스 저장소·revision 및 라이선스는 `assets/NOTICE`를 참고한다.
컴파일러를 변경하면 생성된 manifest와 배포 JAR도 함께 갱신한다.

## 브라우저 환경

WASI와 함께 사용하려면 기존 COOP/COEP 헤더가 필요하다.
CSP를 적용하는 서비스에서는 blob Worker, ES module Worker 자산,
CheerpJ 공식 CDN의 스크립트·WASM·런타임 다운로드를 허용해야 한다.
라이선스 적용 범위는 [CheerpJ 라이선스 문서](https://cheerpj.com/docs/licensing)를 따른다.
