/** Shared toolchain asset base for local connections, independent of execution backend. */
export const defaultAssetBaseUrl = '/toolchains/'

/** CheerpJ owns downloading its JVM assets from this official loader. */
export const defaultCheerpJOptions = {
  loaderUrl: 'https://cjrtnc.leaningtech.com/4.3/loader.js'
} as const

export interface CheerpJOptions {
  loaderUrl?: string
  licenseKey?: string
}
