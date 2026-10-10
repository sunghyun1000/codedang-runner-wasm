import { prepareRunnoToolchains } from './prepare-runno-toolchains.mjs'

await prepareRunnoToolchains()
await import('./prepare-teavm-javac.mjs')
