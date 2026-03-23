import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useJarvisStore } from '@/store/jarvis'
import { Background } from '@/components/hud/Background'
import { BootOverlay } from '@/components/hud/BootOverlay'
import { TitleBar } from '@/components/hud/TitleBar'
import { TabShell } from '@/components/tabs/TabShell'
import { getReactorDisplayStatus } from '@/lib/reactor-display'

export default function App() {
  const setOcStatus = useJarvisStore((s) => s.setOcStatus)
  const setReactorVisualLive = useJarvisStore((s) => s.setReactorVisualLive)
  const pushLog = useJarvisStore((s) => s.pushLog)
  const ocStatus = useJarvisStore((s) => s.ocStatus)
  const statusChecked = useJarvisStore((s) => s.statusChecked)
  const reactorVisualLive = useJarvisStore((s) => s.reactorVisualLive)
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    if (booted) {
      setReactorVisualLive(true)
    }
  }, [booted, setReactorVisualLive])

  useEffect(() => {
    if (!booted) return

    const check = async () => {
      if (!window.jarvis) {
        setOcStatus({ online: false, error: 'No bridge' })
        return
      }

      const status = await window.jarvis.openclaw.status()
      setOcStatus(status)
      if (status.online) pushLog(`Gateway online · ${status.model ?? 'connected'}`, 'success')
      else pushLog(`Gateway unreachable: ${status.error}`, 'error')
    }

    check()
    const id = setInterval(check, 20_000)
    return () => clearInterval(id)
  }, [booted, pushLog, setOcStatus])

  return (
    <div className="relative flex h-screen flex-col overflow-hidden" style={{ background: '#0a0a0f' }}>
      <Background />

      <AnimatePresence>
        {!booted && <BootOverlay onComplete={() => setBooted(true)} />}
      </AnimatePresence>

      <AnimatePresence>
        {booted && (
          <motion.div
            className="relative z-10 flex h-full flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            <TitleBar />
            <TabShell />
            <StatusBar
              reactorVisualLive={reactorVisualLive}
              statusChecked={statusChecked}
              online={ocStatus.online}
              model={ocStatus.model}
              error={ocStatus.error}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StatusBar({
  reactorVisualLive,
  statusChecked,
  online,
  model,
  error,
}: {
  reactorVisualLive: boolean
  statusChecked: boolean
  online: boolean
  model?: string
  error?: string
}) {
  const displayStatus = getReactorDisplayStatus({
    reactorVisualLive,
    statusChecked,
    ocStatus: { online, model, error },
  })
  const color = reactorVisualLive ? 'rgba(0,255,136,0.58)' : 'rgba(255,154,84,0.68)'
  const text = displayStatus.footerText

  return (
    <div
      className="flex h-6 items-center gap-4 px-4 flex-shrink-0"
      style={{
        borderTop: '1px solid rgba(0,212,255,0.08)',
        background: 'rgba(2,8,14,0.56)',
      }}
    >
      <span className="text-[9px] font-mono tracking-[0.14em]" style={{ color: 'rgba(74,122,138,0.62)' }}>
        JARVIS LOCAL SHELL
      </span>
      <span className="text-[9px] font-mono" style={{ color: 'rgba(74,122,138,0.46)' }}>
        bounded local controls
      </span>
      <span className="ml-auto text-[9px] font-mono" style={{ color }}>
        {text}
      </span>
    </div>
  )
}
