export interface StdinTarget {
  write(data: string): Promise<void>
  eof(): Promise<void>
}

/** Buffers input before execution and allows only one writer at a time. */
export class StdinQueue {
  private readonly chunks: Uint8Array[] = []
  private bytes = 0
  private target?: StdinTarget
  private draining = false
  private ended = false
  private closed = false

  constructor(
    private readonly onError: (error: unknown) => void,
    private readonly maxBytes = 1024 * 1024
  ) {}

  push(text: string): void {
    if (this.closed || this.ended) throw new Error('stdin is closed')
    const bytes = new TextEncoder().encode(text)
    if (this.bytes + bytes.length > this.maxBytes) throw new Error('Input queue limit exceeded')
    if (bytes.length) this.chunks.push(bytes)
    this.bytes += bytes.length
    void this.drain()
  }

  attach(target: StdinTarget): void {
    if (this.closed) return
    if (this.target) throw new Error('stdin is already attached')
    this.target = target
    void this.drain()
  }

  end(): void {
    this.ended = true
    void this.drain()
  }

  close(): void {
    this.closed = true
    this.chunks.length = 0
    this.bytes = 0
    this.target = undefined
  }

  private async drain(): Promise<void> {
    if (this.draining || !this.target || this.closed) return
    this.draining = true
    const target = this.target
    try {
      while (this.chunks.length && !this.closed) {
        const bytes = this.chunks[0]
        // Runno reserves four bytes of its 8 KiB stdin buffer for the length.
        let length = Math.min(bytes.length, 8192 - 4)
        while (length < bytes.length && (bytes[length] & 0xc0) === 0x80) length--
        await target.write(new TextDecoder().decode(bytes.subarray(0, length)))
        if (this.closed) return
        this.bytes -= length
        if (length === bytes.length) this.chunks.shift()
        else this.chunks[0] = bytes.subarray(length)
      }
      if (this.ended && !this.closed) {
        await target.eof()
        this.close()
      }
    } catch (error) {
      if (!this.closed) {
        this.close()
        this.onError(error)
      }
    } finally {
      this.draining = false
    }
  }
}
