import type { OpenClawStatus } from '@/types'

export type ReactorDisplayStatus = {
  online: boolean
  color: string
  titleText: string
  coreValue: string
  connectionValue: string
  footerText: string
  gatewayHint: string
}

export function getReactorDisplayStatus({
  reactorVisualLive,
  statusChecked,
  ocStatus,
}: {
  reactorVisualLive: boolean
  statusChecked: boolean
  ocStatus: OpenClawStatus
}): ReactorDisplayStatus {
  const online = reactorVisualLive
  const color = online ? '#00ff88' : '#ff9a54'

  return {
    online,
    color,
    titleText: online
      ? `JARVIS ${ocStatus.model ? `· ${ocStatus.model}` : 'ONLINE'}`
      : 'JARVIS OFFLINE',
    coreValue: online ? 'Online' : 'Offline',
    connectionValue: online ? 'ONLINE' : 'OFFLINE',
    footerText: online
      ? (ocStatus.online ? '● reactor online · gateway connected' : '● reactor online · gateway unavailable')
      : '○ reactor offline',
    gatewayHint: statusChecked
      ? (ocStatus.online ? 'localhost:18789' : 'gateway unavailable')
      : 'probing local gateway',
  }
}
