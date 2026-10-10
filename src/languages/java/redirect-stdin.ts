/** Redirect only resolved java.lang.System.in bytecode references, not source text. */
export function redirectJavaStdin(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0) !== 0xcafebabe) throw new Error('Invalid Java class file')
  const count = view.getUint16(8)
  const utf8 = new Map<number, string>()
  const classes = new Map<number, number>()
  const names = new Map<number, number>()
  const fields: { offset: number; owner: number; name: number }[] = []
  let offset = 10
  for (let index = 1; index < count; index++) {
    const tag = view.getUint8(offset++)
    switch (tag) {
      case 1: {
        const length = view.getUint16(offset)
        offset += 2
        utf8.set(index, new TextDecoder().decode(bytes.subarray(offset, offset + length)))
        offset += length
        break
      }
      case 7: classes.set(index, view.getUint16(offset)); offset += 2; break
      case 12: names.set(index, view.getUint16(offset)); offset += 4; break
      case 9: fields.push({ offset, owner: view.getUint16(offset), name: view.getUint16(offset + 2) }); offset += 4; break
      case 3: case 4: case 10: case 11: case 17: case 18: offset += 4; break
      case 5: case 6: offset += 8; index++; break
      case 8: case 16: case 19: case 20: offset += 2; break
      case 15: offset += 3; break
      default: throw new Error(`Unsupported Java constant pool tag: ${tag}`)
    }
  }
  const matches = fields.filter(field => utf8.get(classes.get(field.owner)!) === 'java/lang/System'
    && utf8.get(names.get(field.name)!) === 'in')
  if (!matches.length) return bytes
  if (count > 65533) throw new Error('Java constant pool is full')
  const name = new TextEncoder().encode('CodedangBootstrap')
  const extra = new Uint8Array(name.length + 6)
  extra[0] = 1
  new DataView(extra.buffer).setUint16(1, name.length)
  extra.set(name, 3)
  extra[name.length + 3] = 7
  new DataView(extra.buffer).setUint16(name.length + 4, count)
  const result = new Uint8Array(bytes.length + extra.length)
  result.set(bytes.subarray(0, offset))
  result.set(extra, offset)
  result.set(bytes.subarray(offset), offset + extra.length)
  const target = new DataView(result.buffer)
  target.setUint16(8, count + 2)
  for (const field of matches) target.setUint16(field.offset, count + 1)
  return result
}
