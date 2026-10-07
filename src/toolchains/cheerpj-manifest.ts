import { defaultCheerpJOptions } from '../config'
import type { ToolchainManifest } from './manifest'

// Decoded HTTPS response sizes/SHA-256, pinned to the CheerpJ 4.3 Java 17 distribution.
// modules contains the complete Java 17 standard library, not just profiled class ranges.
const assets: [string, number, string][] = [
  ['loader.js', 7521, '5b0ec873d1ae97d184928041b5f97ecf36eb990dac3baec5836a90bd87fa7a9f'],
  ['cj3.js', 666055, '5bcf00711009cbb12b858dcbea865cfe0e9d652cfc95f55ad20a600724462644'],
  ['cj3.wasm', 372758, 'b4d6581f7369729a96bddd7b060e3ce539ec4fb1d517e9159615fc0f915d673b'],
  ['cheerpOS.js', 90871, '549c7074a761720b09e5a6526fdb53b686958ffa5f157f16d60ebd0b4a154be3'],
  ['cj3n17.wasm', 3227431, 'ea4763c1a69ae5c9fcfb59643d2b5e6fcd0c97667222b10732d2cfd5f33cd954'],
  ['17/lib/modules', 38145733, 'f121f2dd8164921c36ece441d0ad17043ad3067a698a35ff0b58328cabe93ff7'],
  ['17/lib/tzdb.dat', 102820, '36cf71e63ce2816fe4456e9195e6c27fa7c9cd431c89ba762eba394ec2c7a1e3'],
  ['17/jre/lib/cheerpj-handlers.jar', 6145, 'aee6bb2716976235f49358d509bd863dd9050b6d3460d5aae26fa2c9af22a4b4'],
  ['17/jre/lib/cheerpj-awt.jar', 97111, '963579a22f483a61e13a1e7dec05e78f21e0e2f671f8b7b55aa66b26de951b6b'],
  ['17/jre/lib/cheerpj-jsobject.jar', 1247, '7f860043d6b6a62306bd026a30b4fef7cbfed10272d6a53a7ab77a1605fb0ff7'],
  ['17/conf/security/java.security', 67189, 'c129348e7a3f40b929cb035372dfd9c33f15f366022f6c6c6d35ecd928a307f4'],
  ['etc/users', 39, 'ba22ff21f2d73daf148452051c728541389dc0f91420b4f3bb371bd025362810']
]

/** Custom loader URLs must mirror the pinned 4.3 assets; different versions need a new manifest. */
export function cheerpjManifest(loaderUrl: string = defaultCheerpJOptions.loaderUrl): ToolchainManifest {
  return {
    id: 'cheerpj-java17', version: '4.3',
    assets: assets.map(([path, size, sha256]) => ({
      path: `/${path}`, url: new URL(path, loaderUrl).href, size, sha256
    }))
  }
}
