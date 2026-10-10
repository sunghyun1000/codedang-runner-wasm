import { codedangLanguages } from '../languages'
import { defaultAssetBaseUrl } from '../config'
import { ToolchainLoader, type LoaderOptions } from './loader'
import type { ToolchainManifest } from './manifest'

export interface PrefetchContext {
  selectedLanguage: string
  availableLanguages: readonly string[]
}

export interface PrefetchResult {
  completed: string[]
  errors: Record<string, string>
}

export interface PrefetchStatus {
  language: string
  state: 'preparing' | 'ready' | 'error'
  error?: string
}

/** One sequential background queue: selected language, available languages, then all remaining languages. */
export class ToolchainPrefetcher {
  private readonly loader: ToolchainLoader
  private readonly controller = new AbortController()
  private queue: string[] = []
  private active?: Promise<PrefetchResult>

  constructor(private readonly options: LoaderOptions & {
    onStatus?: (status: PrefetchStatus) => void
  } = {}) {
    this.loader = new ToolchainLoader({
      ...options, assetBaseUrl: options.assetBaseUrl ?? (globalThis.location ? defaultAssetBaseUrl : undefined)
    })
  }

  /** Updating while downloading reorders pending languages, without cancelling the current language. */
  prefetch(context: PrefetchContext): Promise<PrefetchResult> {
    this.controller.signal.throwIfAborted()
    const languages = [...new Set([context.selectedLanguage, ...context.availableLanguages, ...Object.keys(codedangLanguages)])]
    for (const language of languages) {
      if (!Object.hasOwn(codedangLanguages, language)) throw new Error(`Unsupported local language: ${language}`)
    }
    this.queue = languages
    if (!this.active) this.active = this.drain().finally(() => { this.active = undefined })
    return this.active
  }

  /** Call when the owning page/component is disposed. */
  dispose(): void { this.controller.abort(); this.queue = [] }

  private async drain(): Promise<PrefetchResult> {
    const result: PrefetchResult = { completed: [], errors: {} }
    const visited = new Set<string>()
    const prepared = new Set<string>()
    while (this.queue.length) {
      this.controller.signal.throwIfAborted()
      const language = this.queue.shift()!
      if (visited.has(language)) continue
      visited.add(language)
      this.options.onStatus?.({ language, state: 'preparing' })
      const manifests: ToolchainManifest[] = []
      const toolchain = codedangLanguages[language].toolchain
      if (toolchain) manifests.push(toolchain)
      for (const manifest of manifests) {
        try {
          const key = JSON.stringify(manifest)
          if (prepared.has(key)) continue // C and C++ share the same assets.
          await this.loader.prefetch(manifest, this.controller.signal)
          prepared.add(key)
        } catch (error) {
          this.controller.signal.throwIfAborted()
          result.errors[language] ??= error instanceof Error ? error.message : String(error)
        }
      }
      if (!result.errors[language]) {
        result.completed.push(language)
        this.options.onStatus?.({ language, state: 'ready' })
      } else this.options.onStatus?.({ language, state: 'error', error: result.errors[language] })
    }
    return result
  }
}
