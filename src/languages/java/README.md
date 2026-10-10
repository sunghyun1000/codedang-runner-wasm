# Browser Java runner (TeaVM)

Java compilation and execution happen entirely in browser Workers. No execution
server or JVM is used at runtime. C/C++/Python continue to use Runno WASI; Java
uses TeaVM WasmGC and the unchanged upstream loader.

## Assets

There is no GitHub release for `konsoletyper/teavm-javac`. The official Playground
distribution lacks APIs needed by this integration, so we built the official
source without changes at commit `208d4c97a602ba0df055f16e6882059fb69d0122`
(TeaVM dependency 0.16.0).

Local distribution: `.toolchains/java/teavm-javac/`:

- `compiler.wasm`, `compiler.wasm-runtime.js`
- `compile-classlib-teavm.bin`, `runtime-classlib-teavm.bin`
- `runtime-compat.bin` — separate, project-owned reader compatibility overlay
- `scanner-sdk.bin`, `scanner-runtime.bin` — separate Scanner API and TScanner implementation
- `upstream-dist.zip`, `PROVENANCE.json`, `UPSTREAM-README.md`, `OPENJDK-LICENSE`
- `build-source/` — clean pinned upstream checkout and corresponding OpenJDK sources
- `.build-tools/` — local build JDK (not a browser asset)

The upstream four execution assets total approximately 6.9 MiB. Build directories
are not shipped to the browser. Asset sizes and SHA-256 are pinned in
`toolchain.json`; `prepare:toolchains` verifies existing files rather than silently
downloading a different version.

Rebuild with JDK 25 (normal application builds need no JDK when assets exist):

```sh
JAVA_HOME=/path/to/jdk-25 npm run build:java
npm run prepare:toolchains
npm run dev:playground
```

If a rebuild changes bytes, review the change and update the manifest. Build
scripts refuse to overwrite a modified/different upstream checkout.
For S3/CDN deployment, publish the seven manifest assets under
`<assetBaseUrl>/java/teavm-javac/`. No S3 upload is performed automatically.

## Input/output

The runner adds `CodedangBootstrap.java` alongside `Main.java`, and redirects
resolved `java.lang.System.in` field references in javac-generated classfiles to
the bootstrap stream. This is a constant-pool transformation, not a source-text
replacement; comments, strings and user-defined `System` classes are unaffected.
The bootstrap initializes stdin before invoking `Main.main(String[])`.

The execution Worker reads a SharedArrayBuffer mailbox. When empty, `Atomics.wait`
blocks that Worker only; the page supplies bytes and calls `Atomics.notify`.
EOF is a distinct mailbox state, not an empty buffer. No JSPI is needed by this
stdin mechanism. The upstream loader is imported verbatim from verified bytes.
Its `installImports` hook connects `teavmConsole` stdout/stderr to runner events.
Prompts are flushed before blocking on input; output is chunked to avoid one
Worker message per character.

COOP/COEP, WasmGC, blob module Workers and the upstream loader's dynamic JS
interop must be allowed by the browser/CSP. Cancelling terminates the Worker.
Input, output and time limits remain enforced by `RunnerSession`.

## Compatibility overlays and limits

Upstream sources, compiler binary, loader and the two classlib files remain
unchanged. The runner separately supplies:

1. A compile-only `java.lang.annotation.Annotation` SDK correction (the upstream
   stub inherits itself, causing annotation compilation to overflow the stack).
2. A project-owned `TInputStreamReader` overlay, built from
   `scripts/java/TInputStreamReader.java`, avoiding the upstream NIO/JSByRef path
   that fails during nested WasmGC compilation.
3. Scanner SDK/runtime overlays built from `scripts/java/scanner/java/util/Scanner.java`
   and `InputMismatchException.java`. `BuildScannerOverlay.java` packages the SDK
   definitions as `java.util.Scanner` and maps the implementation to
   `org.teavm.classlib.java.util.TScanner`. The existing upstream substitution policy
   resolves that runtime class automatically. Both archives are supplied through
   the public `setSdk`/`setTeaVMClasslib` APIs. No compiler fork or source rewriting
   is involved.

The reader supports UTF-8, ASCII and ISO-8859-1. It is not a complete replacement
for JDK charset/decoder behavior; arbitrary charsets, configured CharsetDecoder
policies and malformed-input equivalence have not been validated.

**This is not full Java SE compatibility.** The project now supplies Scanner for
console algorithms. Supported constructors: InputStream (default/explicit charset),
String, and Reader-backed Readable. Supported methods:

- `next`, `nextLine`, `hasNext`, `hasNextLine`, including non-consuming lookahead
- byte/short/int/long/float/double/boolean/BigInteger/BigDecimal readers and lookahead
- integer radix overloads, `useRadix`, `useDelimiter` (String/Pattern), pattern-based
  `next`/`hasNext`, `reset`, `close`, `ioException`
- common numeric locale separators for English, German, French, Korean, Japanese
  and Chinese (Swiss locales and other languages are explicitly rejected)

This is a compatibility subset, not a complete JDK Scanner implementation.
File/Path/channel constructors, custom non-Reader Readable, `find*`, `skip`,
`match`, stream APIs, localized currency/negative affixes and all locale variants
are not covered. Input decoding inherits the reader overlay's limitations above.
Other missing/unsupported APIs are reported as compile
errors. No guarantee is made for arbitrary algorithms, threading, reflection,
System.exit or every Java language feature. Browser tests currently validate
basic execution, Unicode output, interactive byte/line/token input, EOF, compile errors
and cancellation/re-execution in Chromium. The shared fixture
`tests/fixtures/java/scanner-contract/Main.java` runs unchanged against JDK Scanner,
our compatibility class on the JVM, and TeaVM WasmGC. It covers line/token mixing,
overflow, invalid tokens remaining unconsumed, regex delimiters, Unicode digits,
radices, BigInteger/BigDecimal, common locales, closure, I/O errors and 6000 tokens.
`npm test` runs the JVM comparison when a JDK is available; browser tests require
a JDK for their reference output, but end-user browsers do not.

The compiler is initialized per submission; a warm compiler pool is not yet
implemented. Hello World measured approximately 1.5 seconds locally in Chromium
with available assets; this is not a cross-device performance guarantee.

## Licensing

TeaVM and teavm-javac use Apache-2.0; the bundled OpenJDK javac uses GPLv2 with
Classpath Exception. Keep required notices and corresponding sources when
redistributing assets. The upstream checkout and OpenJDK build sources are kept
locally, but publishing only the runtime files is not a license-compliance
plan on its own.
