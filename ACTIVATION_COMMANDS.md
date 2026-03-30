# Activation Commands

Updated: 2026-03-29

These commands match the current code signatures.

## Governance inventory / vetting

```ts
import {
  inventorySkills,
  markSkillVetted,
  grantPermission,
} from '@/integrations/governance/skill-governance'
```

Populate store:

```ts
await inventorySkills()
```

Vet a skill:

```ts
await markSkillVetted('advanced-calendar', 'manual review completed')
await markSkillVetted('brainrepo', 'manual review completed')
await markSkillVetted('agent-mail-cli', 'manual review completed')
await markSkillVetted('elevenlabs-tts', 'manual review completed')
await markSkillVetted('eachlabs-music', 'manual review completed')
```

Grant an additional permission:

```ts
await grantPermission('agent-mail-cli', 'email')
```

## Flag changes

Enable read-only networked providers:

```ts
// src/shared/operational-safety.ts
export const NO_SECRETS_MODE = false
export const CAPABILITIES = {
  execute: false,
  write: false,
  network: true,
} as const
```

Enable execute providers:

```ts
export const CAPABILITIES = {
  execute: true,
  write: false,
  network: true,
} as const
```

Enable the only currently supported live write candidate:

```ts
export const DRY_RUN = false
export const CAPABILITIES = {
  execute: true,
  write: true,
  network: true,
} as const
```

## What not to script as an activation command yet

Do not treat these as valid live-enable commands yet:

- memory live write
- calendar live write
- concierge draft generation
- concierge booking dispatch
- builder live execution

The providers still stage these paths even after flags change.
