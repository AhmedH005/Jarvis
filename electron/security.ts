import path from 'node:path'
import { CAPABILITIES, DRY_RUN, NO_SECRETS_MODE, SAFE_ROOT_DIRNAME, getRuntimeSafetySnapshot } from '../src/shared/operational-safety'

export const SAFE_ROOT = path.join(process.cwd(), SAFE_ROOT_DIRNAME)

export function resolveSafePath(targetPath: string): string {
  const resolved = path.resolve(targetPath)
  const normalizedRoot = path.resolve(SAFE_ROOT)

  if (resolved !== normalizedRoot && !resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Blocked path outside SAFE_ROOT: ${targetPath}`)
  }

  return resolved
}

export function getSecuritySnapshot() {
  return {
    ...getRuntimeSafetySnapshot(),
    safeRoot: SAFE_ROOT,
  }
}

export function hasCapability(capability: keyof typeof CAPABILITIES): boolean {
  return CAPABILITIES[capability]
}

export function executionBlockedMessage(): string {
  if (DRY_RUN) return 'Blocked (dry run)'
  return 'Blocked (capability gate)'
}

export function readSecret(name: string): string {
  if (NO_SECRETS_MODE) return ''
  return process.env[name] ?? ''
}
