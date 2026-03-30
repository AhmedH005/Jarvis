function joinSafeRoot(root: string, relativePath: string): string {
  return `${root.replace(/[\\/]+$/, '')}/${relativePath.replace(/^[\\/]+/, '')}`
}

async function getSafeRoot(): Promise<string | null> {
  const diagnostics = await window.jarvis?.runtime?.getDiagnostics?.()
  return diagnostics?.safety.safeRoot ?? null
}

export async function readSafeFile(relativePath: string): Promise<string | null> {
  const root = await getSafeRoot()
  if (!root || !window.jarvis?.fs?.readFile) return null
  const result = await window.jarvis.fs.readFile(joinSafeRoot(root, relativePath))
  if (!result.ok) {
    console.warn('[safe-file] read failed', {
      relativePath,
      error: result.error ?? 'unknown error',
    })
  }
  return result.ok ? result.content : null
}

export async function readSafeJson<T>(relativePath: string, fallback: T): Promise<T> {
  const raw = await readSafeFile(relativePath)
  if (!raw) return fallback

  try {
    return JSON.parse(raw) as T
  } catch (error) {
    console.warn('[safe-file] json parse failed', {
      relativePath,
      error: error instanceof Error ? error.message : String(error),
    })
    return fallback
  }
}
