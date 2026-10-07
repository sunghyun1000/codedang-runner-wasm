/** CheerpJ owns downloading its JVM assets from this official loader. */
export const defaultCheerpJOptions = {
  loaderUrl: 'https://cjrtnc.leaningtech.com/4.3/loader.js'
} as const

export interface CheerpJOptions {
  loaderUrl?: string
  licenseKey?: string
}
