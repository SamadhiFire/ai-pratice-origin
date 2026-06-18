export function resolveSafeTopPadding(extraPx = 12): number {
  let safeTop = 64

  try {
    const system = uni.getSystemInfoSync ? uni.getSystemInfoSync() : null
    const statusBarHeight = Number(system?.statusBarHeight || 0)
    if (Number.isFinite(statusBarHeight) && statusBarHeight > 0) {
      safeTop = Math.max(safeTop, statusBarHeight + extraPx + 8)
    }
  } catch {
    // keep fallback
  }

  try {
    const getter = (uni as unknown as { getMenuButtonBoundingClientRect?: () => { bottom?: number } })
      .getMenuButtonBoundingClientRect
    if (typeof getter === 'function') {
      const rect = getter()
      const bottom = Number(rect?.bottom || 0)
      if (Number.isFinite(bottom) && bottom > 0) {
        safeTop = Math.max(safeTop, bottom + extraPx)
      }
    }
  } catch {
    // keep fallback
  }

  return Math.min(Math.max(Math.round(safeTop), 64), 180)
}

export function resolveStatusBarTopPadding(): number {
  try {
    const system = uni.getSystemInfoSync ? uni.getSystemInfoSync() : null
    const statusBarHeight = Number(system?.statusBarHeight || 0)
    if (Number.isFinite(statusBarHeight) && statusBarHeight > 0) {
      return Math.round(statusBarHeight)
    }
  } catch {
    // keep fallback
  }

  return 24
}
