import { prepareRunnoToolchains } from './prepare-runno-toolchains.mjs'
import { prepareJavaToolchain } from './prepare-java-toolchain.mjs'

await prepareRunnoToolchains()
await prepareJavaToolchain()
