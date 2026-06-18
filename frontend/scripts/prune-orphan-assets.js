const fs = require('fs')
const path = require('path')

const DIST_ROOT = path.resolve(process.cwd(), 'dist/build/mp-weixin')
const ASSETS_DIR = path.join(DIST_ROOT, 'assets')
const REFERENCE_EXTENSIONS = new Set(['.js', '.json', '.wxml', '.wxss', '.wxs'])

function walkFiles(dir) {
  const output = []
  if (!fs.existsSync(dir)) return output
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  entries.forEach((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      output.push(...walkFiles(fullPath))
      return
    }
    output.push(fullPath)
  })
  return output
}

function collectReferenceText() {
  const files = walkFiles(DIST_ROOT).filter((filePath) =>
    REFERENCE_EXTENSIONS.has(path.extname(filePath).toLowerCase()),
  )

  return files
    .map((filePath) => {
      try {
        return fs.readFileSync(filePath, 'utf8')
      } catch {
        return ''
      }
    })
    .join('\n')
}

function pruneOrphanAssetsOnce() {
  if (!fs.existsSync(ASSETS_DIR)) {
    return []
  }

  const referenceText = collectReferenceText()
  const assetFiles = fs.readdirSync(ASSETS_DIR).filter((name) =>
    fs.statSync(path.join(ASSETS_DIR, name)).isFile(),
  )

  const pruned = []
  assetFiles.forEach((name) => {
    const normalized = `/assets/${name}`
    const fallback = `assets/${name}`
    if (referenceText.includes(normalized) || referenceText.includes(fallback)) {
      return
    }
    fs.rmSync(path.join(ASSETS_DIR, name), { force: true })
    pruned.push(name)
  })

  return pruned
}

function sleep(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return
  const signal = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(signal, 0, 0, ms)
}

function pruneOrphanAssets() {
  const removedAll = []
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const pruned = pruneOrphanAssetsOnce()
    removedAll.push(...pruned)
    if (attempt < 4) {
      sleep(220)
    }
  }

  const uniqueRemoved = Array.from(new Set(removedAll))
  if (uniqueRemoved.length > 0) {
    console.log(`[prune-orphan-assets] removed ${uniqueRemoved.length} file(s): ${uniqueRemoved.join(', ')}`)
    return
  }

  if (!fs.existsSync(ASSETS_DIR)) {
    console.log('[prune-orphan-assets] assets directory not found')
    return
  }

  const currentAssets = fs.readdirSync(ASSETS_DIR).filter((name) =>
    fs.statSync(path.join(ASSETS_DIR, name)).isFile(),
  )
  if (currentAssets.length === 0) {
    console.log('[prune-orphan-assets] assets directory is empty')
    return
  }

  console.log('[prune-orphan-assets] no orphan assets found')
}

function run() {
  if (!fs.existsSync(DIST_ROOT)) {
    console.log('[prune-orphan-assets] dist output not found, skip')
    return
  }

  pruneOrphanAssets()
}

run()
