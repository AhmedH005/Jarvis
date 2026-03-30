import type { SkillManifest } from '../types'

const manifest: SkillManifest = {
  key: 'bookameeting',
  label: 'Book A Meeting',
  domain: 'concierge',
  packageName: 'bookameeting',
  purpose: 'Booking and scheduling assistant used by Concierge for staged reservations.',
  summaryLines: [
    'Handles meeting and booking intake without pretending to auto-confirm.',
  ],
  requires: {
    execute: true,
    write: true,
    network: true,
  },
}

export default manifest
