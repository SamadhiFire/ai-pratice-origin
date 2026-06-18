export interface Chunk {
  index: number
  text: string
}

const DEFAULT_MIN_CHUNK = 50
const MAX_CHUNK = 600

export function chunkMaterial(text: string, minChunk = DEFAULT_MIN_CHUNK): Chunk[] {
  const source = text.trim()
  if (!source) return []

  const paragraphs = source.split(/\n\n+/)
  const chunks: Chunk[] = []

  let current = ''
  let index = 0

  for (const paragraph of paragraphs) {
    const clean = paragraph.trim()
    if (!clean) continue

    if (clean.length > MAX_CHUNK) {
      if (current.length >= minChunk) {
        chunks.push({ index, text: current })
        index += 1
        current = ''
      }

      const parts = clean.split(/(?<=[。！？!?；;\n])/)
      let buffer = ''

      for (const part of parts) {
        if (!part) continue
        if (buffer.length + part.length > MAX_CHUNK && buffer.length >= minChunk) {
          chunks.push({ index, text: buffer.trim() })
          index += 1
          buffer = part
        } else {
          buffer += part
        }
      }

      current = buffer.trim()
    } else {
      current = current ? `${current}\n\n${clean}` : clean
    }
  }

  if (current.trim().length >= minChunk) {
    chunks.push({ index, text: current.trim() })
  }

  if (chunks.length === 0 && source.length >= minChunk) {
    chunks.push({ index: 0, text: source })
  }

  return chunks
}
