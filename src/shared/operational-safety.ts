export const DRY_RUN = true

export const NO_SECRETS_MODE = true

export const CAPABILITIES = {
  execute: false,
  write: false,
  network: false,
} as const

export const SAFE_ROOT_DIRNAME = 'jarvis-runtime'

export type CapabilityName = keyof typeof CAPABILITIES

export interface RuntimeSafetySnapshot {
  dryRun: boolean
  noSecretsMode: boolean
  capabilities: typeof CAPABILITIES
  safeRootDirname: string
}

export function getRuntimeSafetySnapshot(): RuntimeSafetySnapshot {
  return {
    dryRun: DRY_RUN,
    noSecretsMode: NO_SECRETS_MODE,
    capabilities: CAPABILITIES,
    safeRootDirname: SAFE_ROOT_DIRNAME,
  }
}
