import type { OpenClawStatus } from '../types'
import type { GmailStatus } from './gmail-bridge'
import type { RuntimeSafetySnapshot } from './operational-safety'
import type { PhoneWebhookConfig } from './phone-bridge'

export interface RuntimeCredentialStatus {
  provider: string
  /**
   * True when the key/token is present in the process environment AND accessible
   * through readSecret() (i.e. NO_SECRETS_MODE is off).
   */
  configured: boolean
  /**
   * True when the key/token exists in process.env regardless of NO_SECRETS_MODE.
   * Use this to distinguish "key genuinely absent" from "key present but secrets
   * mode is blocking access".
   */
  keyPresentInEnv: boolean
  missing: string[]
}

export interface RuntimeDiagnostics {
  checkedAt: string
  safety: RuntimeSafetySnapshot & {
    safeRoot: string
  }
  openclaw: OpenClawStatus
  gmail: GmailStatus
  phone: PhoneWebhookConfig
  llm: RuntimeCredentialStatus
  speech: RuntimeCredentialStatus & {
    voiceIdConfigured: boolean
  }
  media: RuntimeCredentialStatus
  telegram: RuntimeCredentialStatus & {
    restrictedToChatId: boolean
  }
}
