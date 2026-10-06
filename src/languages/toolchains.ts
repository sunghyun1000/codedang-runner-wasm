import type { ToolchainManifest } from '../toolchains/manifest'

export const python311: ToolchainManifest = {
  id: 'runno-python',
  version: '3.11.3',
  assets: [
    {
      path: '/python-3.11.3.wasm',
      url: 'python-3.11.3.wasm',
      size: 20_538_911,
      sha256: '658cb6add2bbf8dfe84d67fb85430956d5a8b2b1d694d33432d654cdf048f813'
    },
    {
      path: '/__archives/python-3.11.3.tar.gz',
      url: 'python-3.11.3.tar.gz',
      size: 4_066_590,
      sha256: '8c42694e45f2f1162114c70507c3da4c7cf983663e2b95660af521a9685d2a0c',
      archive: 'tar.gz'
    }
  ]
}

export const runnoClang8: ToolchainManifest = {
  id: 'runno-clang',
  version: '8.0.1',
  assets: [
    {
      path: '/clang.wasm',
      url: 'clang.wasm',
      size: 31_214_472,
      sha256: '2a466f0e990329d3230b869d04fc20803eae96a7feb3a3f6c93e25a77b8aed1d'
    },
    {
      path: '/wasm-ld.wasm',
      url: 'wasm-ld.wasm',
      size: 19_490_094,
      sha256: '36419ed202011765222098d7701218378b67f634d50f0a4625059ae2c9860f48'
    },
    {
      path: '/__archives/clang-fs.tar.gz',
      url: 'clang-fs.tar.gz',
      size: 1_790_862,
      sha256: '7ed12063619882e4dfa710ab371fc91848b256f85a4075747e8bd5c167902b50',
      archive: 'tar.gz'
    }
  ]
}
